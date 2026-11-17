import uuid
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select

from app.deps import Page, PageQuery, PageSizeQuery, SessionDep
from app.errors import AppError
from app.i18n import pick
from app.modules.audit.models import apply_changes, record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.bookings.models import Booking
from app.modules.customers.models import Customer
from app.modules.site.models import get_site_settings

router = APIRouter(prefix="/admin/customers", tags=["admin: customers"])

Reader = Annotated[CurrentUser, Depends(require(Permission.CUSTOMERS_READ))]
Writer = Annotated[CurrentUser, Depends(require(Permission.CUSTOMERS_WRITE))]


class CustomerRow(BaseModel):
    id: uuid.UUID
    name: str
    phone_e164: str
    email: str | None
    bookings: int
    last_visit: datetime | None
    created_at: datetime


class CustomerBooking(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    starts_at: datetime
    services: list[str]
    total_kzt: int
    final_amount_kzt: int | None


class CustomerDetail(CustomerRow):
    notes: str | None
    history: list[CustomerBooking]


class CustomerPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    notes: str | None = Field(default=None, max_length=2000)


_stats = (
    select(
        Booking.customer_id,
        func.count().label("bookings"),
        func.max(Booking.starts_at).label("last_visit"),
    )
    .group_by(Booking.customer_id)
    .subquery()
)


def _row(
    customer: Customer, bookings: int | None, last_visit: datetime | None, tz: ZoneInfo
) -> dict:
    return {
        "id": customer.id,
        "name": customer.name,
        "phone_e164": customer.phone_e164,
        "email": customer.email,
        "bookings": bookings or 0,
        "last_visit": last_visit.astimezone(tz) if last_visit else None,  # business time
        "created_at": customer.created_at,
    }


@router.get("")
def list_customers(
    user: Reader,
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 50,
) -> Page[CustomerRow]:
    tz = ZoneInfo(get_site_settings(session).timezone)
    query = select(Customer, _stats.c.bookings, _stats.c.last_visit).outerjoin(
        _stats, _stats.c.customer_id == Customer.id
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                Customer.name.ilike(like),
                Customer.phone_e164.ilike(like),
                Customer.email.ilike(like),
            )
        )
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.execute(
        query.order_by(_stats.c.last_visit.desc().nulls_last(), Customer.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return Page(
        items=[CustomerRow(**_row(c, n, last, tz)) for c, n, last in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{customer_id}")
def get_customer(customer_id: uuid.UUID, user: Reader, session: SessionDep) -> CustomerDetail:
    tz = ZoneInfo(get_site_settings(session).timezone)
    row = session.execute(
        select(Customer, _stats.c.bookings, _stats.c.last_visit)
        .outerjoin(_stats, _stats.c.customer_id == Customer.id)
        .where(Customer.id == customer_id)
    ).first()
    if row is None:
        raise AppError(404, "CUSTOMER_NOT_FOUND")
    customer = row[0]
    bookings = session.scalars(
        select(Booking)
        .where(Booking.customer_id == customer_id)
        .order_by(Booking.starts_at.desc())
        .limit(100)
    )
    return CustomerDetail(
        **_row(*row, tz),
        notes=customer.notes,
        history=[
            CustomerBooking(
                id=b.id,
                reference=b.reference,
                status=b.status,
                starts_at=b.starts_at.astimezone(tz),
                services=[pick(i.name_i18n, "ru") for i in b.items],
                total_kzt=b.total_kzt,
                final_amount_kzt=b.final_amount_kzt,
            )
            for b in bookings
        ],
    )


@router.patch("/{customer_id}")
def update_customer(
    customer_id: uuid.UUID, body: CustomerPatch, user: Writer, session: SessionDep
) -> CustomerDetail:
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise AppError(404, "CUSTOMER_NOT_FOUND")
    before, after = apply_changes(customer, body.model_dump(exclude_unset=True))
    if after:
        record_user(
            session, user, "customer.updated", "customer", customer.id, before=before, after=after
        )
    session.commit()
    return get_customer(customer_id, user, session)
