"""Booking management for staff. Employees see and work only their own bookings."""

import uuid
from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Query
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.deps import Page, PageQuery, PageSizeQuery, SessionDep, paginate
from app.errors import AppError
from app.i18n import pick
from app.modules.audit.models import AuditLog, apply_changes, record_user
from app.modules.auth.models import User
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.bookings import public, service
from app.modules.bookings.models import STATUSES, Booking
from app.modules.bookings.public import CustomerIn
from app.modules.catalog.models import VehicleCategory
from app.modules.pricing.service import Selection
from app.modules.site.models import get_site_settings
from app.modules.staff.models import Employee

router = APIRouter(prefix="/admin/bookings", tags=["admin: bookings"])

Reader = Annotated[CurrentUser, Depends(require(Permission.BOOKINGS_READ))]
Worker = Annotated[CurrentUser, Depends(require(Permission.BOOKINGS_WORK))]
Manager = Annotated[CurrentUser, Depends(require(Permission.BOOKINGS_WRITE))]
Status = Literal[STATUSES]  # type: ignore[valid-type]


class Ref(BaseModel):
    id: int | uuid.UUID
    name: str


class BookingRow(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    source: str
    starts_at: datetime
    ends_at: datetime
    employee: Ref
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str
    vehicle: str
    services: list[str]
    total_kzt: int
    final_amount_kzt: int | None
    created_at: datetime


class ItemOut(BaseModel):
    name: str
    role: str
    options: list[str]
    price_kzt: int
    duration_min: int


class HistoryOut(BaseModel):
    at: datetime
    action: str
    actor: str | None
    before: dict | None
    after: dict | None


class BookingDetail(BookingRow):
    customer_email: str | None
    vehicle_note: str | None
    customer_comment: str | None
    internal_notes: str | None
    items: list[ItemOut]
    subtotal_kzt: int
    discount_kzt: int
    discount_name: str | None
    cancel_reason: str | None
    history: list[HistoryOut]


class AdminBookingIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    selection: Selection
    starts_at: AwareDatetime
    customer: CustomerIn
    vehicle_note: str | None = Field(default=None, max_length=200)
    comment: str | None = Field(default=None, max_length=1000)
    employee_id: int | None = None
    confirmed: bool = True  # bookings taken by phone are usually confirmed on the spot


class BookingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    internal_notes: str | None = Field(default=None, max_length=4000)
    vehicle_note: str | None = Field(default=None, max_length=200)


class StatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["confirmed", "in_progress", "completed", "cancelled", "no_show"]
    final_amount_kzt: int | None = Field(default=None, ge=0, le=100_000_000)
    reason: str | None = Field(default=None, max_length=500)


class RescheduleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: AwareDatetime
    employee_id: int | None = None


class AssignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_id: int


# --- helpers ------------------------------------------------------------------------------


def own_employee_id(session: Session, user: CurrentUser) -> int | None:
    """For the employee role: their employee id (-1 if not linked: they see nothing).
    For everyone else: None, meaning no restriction."""
    if user.can(Permission.BOOKINGS_WRITE):
        return None
    return session.scalar(select(Employee.id).where(Employee.user_id == user.id)) or -1


def _get(session: Session, user: CurrentUser, booking_id: uuid.UUID) -> Booking:
    booking = session.get(Booking, booking_id)
    own = own_employee_id(session, user)
    # Someone else's booking looks exactly like a missing one (no existence leak).
    if booking is None or (own is not None and booking.employee_id != own):
        raise AppError(404, "BOOKING_NOT_FOUND")
    return booking


def _rows(session: Session, bookings: list[Booking], tz: ZoneInfo) -> list[BookingRow]:
    employees = {e.id: e.display_name for e in session.scalars(select(Employee))}
    vehicles = {v.id: pick(v.name_i18n, "ru") for v in session.scalars(select(VehicleCategory))}
    return [
        BookingRow(
            id=b.id,
            reference=b.reference,
            status=b.status,
            source=b.source,
            starts_at=b.starts_at.astimezone(tz),
            ends_at=b.ends_at.astimezone(tz),
            employee=Ref(id=b.employee_id, name=employees.get(b.employee_id, "?")),
            customer_id=b.customer_id,
            customer_name=b.customer_name,
            customer_phone=b.customer_phone,
            vehicle=vehicles.get(b.vehicle_category_id, "?"),
            services=[pick(i.name_i18n, "ru") for i in b.items],
            total_kzt=b.total_kzt,
            final_amount_kzt=b.final_amount_kzt,
            created_at=b.created_at,
        )
        for b in bookings
    ]


def _detail(session: Session, booking: Booking) -> BookingDetail:
    tz = ZoneInfo(get_site_settings(session).timezone)
    session.refresh(booking)
    names = {u.id: u.full_name for u in session.scalars(select(User))}
    history = session.scalars(
        select(AuditLog)
        .where(AuditLog.entity_type == "booking", AuditLog.entity_id == str(booking.id))
        .order_by(AuditLog.id)
    )
    return BookingDetail(
        **_rows(session, [booking], tz)[0].model_dump(),
        customer_email=booking.customer_email,
        vehicle_note=booking.vehicle_note,
        customer_comment=booking.customer_comment,
        internal_notes=booking.internal_notes,
        items=[
            ItemOut(
                name=pick(i.name_i18n, "ru"),
                role=i.role,
                options=[pick(o["name_i18n"], "ru") for o in i.options],
                price_kzt=i.price_kzt,
                duration_min=i.duration_min,
            )
            for i in booking.items
        ],
        subtotal_kzt=booking.subtotal_kzt,
        discount_kzt=booking.discount_kzt,
        discount_name=pick(booking.discount_name_i18n, "ru"),
        cancel_reason=booking.cancel_reason,
        history=[
            HistoryOut(
                at=h.created_at,
                action=h.action,
                actor=names.get(h.actor_user_id) if h.actor_user_id else h.actor_kind,
                before=h.before,
                after=h.after,
            )
            for h in history
        ],
    )


# --- endpoints ------------------------------------------------------------------------------


@router.get("")
def list_bookings(
    user: Reader,
    session: SessionDep,
    status: Annotated[list[Status], Query()] = [],  # noqa: B006 - FastAPI query list
    date_from: date | None = None,  # business-local dates, inclusive
    date_to: date | None = None,
    employee_id: int | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Literal["starts_at", "-starts_at", "created_at", "-created_at"] = "starts_at",
    page: PageQuery = 1,
    page_size: PageSizeQuery = 50,
) -> Page[BookingRow]:
    tz = ZoneInfo(get_site_settings(session).timezone)
    query = select(Booking)
    own = own_employee_id(session, user)
    if own is not None:
        query = query.where(Booking.employee_id == own)
    elif employee_id is not None:
        query = query.where(Booking.employee_id == employee_id)
    if status:
        query = query.where(Booking.status.in_(status))
    if date_from:
        query = query.where(Booking.blocked_until > datetime.combine(date_from, time(0), tz))
    if date_to:
        end = datetime.combine(date_to + timedelta(days=1), time(0), tz)
        query = query.where(Booking.starts_at < end)
    if q:
        like = f"%{q.strip()}%"  # bound parameter, not string-built SQL
        query = query.where(
            or_(
                Booking.reference.ilike(like),
                Booking.customer_name.ilike(like),
                Booking.customer_phone.ilike(like),
            )
        )
    column = getattr(Booking, sort.lstrip("-"))
    query = query.order_by(column.desc() if sort.startswith("-") else column, Booking.id)
    items, total = paginate(session, query, page, page_size)
    return Page(items=_rows(session, items, tz), total=total, page=page, page_size=page_size)


@router.get("/{booking_id}")
def get_booking(booking_id: uuid.UUID, user: Reader, session: SessionDep) -> BookingDetail:
    return _detail(session, _get(session, user, booking_id))


@router.post("", status_code=201)
def create_booking(
    body: AdminBookingIn,
    user: Manager,
    session: SessionDep,
    idempotency_key: Annotated[uuid.UUID, Header(alias="Idempotency-Key")],
) -> BookingDetail:
    settings = get_site_settings(session)
    booking, _ = service.create_booking(
        session,
        selection=body.selection,
        starts_at=body.starts_at,
        customer_name=body.customer.name,
        customer_phone=body.customer.phone,
        customer_email=body.customer.email,
        vehicle_note=body.vehicle_note,
        comment=body.comment,
        idempotency_key=idempotency_key,
        policy=settings.booking,
        tz=ZoneInfo(settings.timezone),
        now=public.utcnow(),
        staff=user,
        employee_id=body.employee_id,
        status="confirmed" if body.confirmed else "pending",
    )
    session.commit()
    return _detail(session, booking)


@router.patch("/{booking_id}")
def update_booking(
    booking_id: uuid.UUID, body: BookingPatch, user: Manager, session: SessionDep
) -> BookingDetail:
    booking = _get(session, user, booking_id)
    before, after = apply_changes(booking, body.model_dump(exclude_unset=True))
    if after:
        record_user(
            session, user, "booking.updated", "booking", booking.id, before=before, after=after
        )
    session.commit()
    return _detail(session, booking)


@router.post("/{booking_id}/status")
def set_status(
    booking_id: uuid.UUID, body: StatusIn, user: Worker, session: SessionDep
) -> BookingDetail:
    booking = _get(session, user, booking_id)
    service.change_status(
        session,
        booking,
        body.status,
        user=user,
        may_manage=user.can(Permission.BOOKINGS_WRITE),
        final_amount_kzt=body.final_amount_kzt,
        reason=body.reason,
        now=public.utcnow(),
    )
    session.commit()
    return _detail(session, booking)


@router.post("/{booking_id}/reschedule")
def reschedule_booking(
    booking_id: uuid.UUID, body: RescheduleIn, user: Manager, session: SessionDep
) -> BookingDetail:
    booking = _get(session, user, booking_id)
    settings = get_site_settings(session)
    service.reschedule(
        session,
        booking,
        starts_at=body.starts_at,
        employee_id=body.employee_id,
        user=user,
        policy=settings.booking,
        tz=ZoneInfo(settings.timezone),
        now=public.utcnow(),
    )
    session.commit()
    return _detail(session, booking)


@router.post("/{booking_id}/assign")
def assign_booking(
    booking_id: uuid.UUID, body: AssignIn, user: Manager, session: SessionDep
) -> BookingDetail:
    booking = _get(session, user, booking_id)
    settings = get_site_settings(session)
    service.reschedule(
        session,
        booking,
        starts_at=booking.starts_at,
        employee_id=body.employee_id,
        user=user,
        policy=settings.booking,
        tz=ZoneInfo(settings.timezone),
        now=public.utcnow(),
    )
    session.commit()
    return _detail(session, booking)
