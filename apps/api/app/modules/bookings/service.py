"""Booking creation, lookup, cancellation, status changes and rescheduling.

Concurrency: availability is re-checked here, but the final word is the database's
exclusion constraint `bookings_no_overlap`. Each candidate employee is tried inside a
SAVEPOINT; if a concurrent request took the slot, PostgreSQL raises 23P01 and we try the
next employee, or answer 409 when none is left.
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError
from app.modules.audit.models import record
from app.modules.auth.permissions import CurrentUser
from app.modules.bookings.models import ACTIVE_STATUSES, Booking, BookingItem
from app.modules.customers.models import Customer
from app.modules.pricing.engine import Quote
from app.modules.pricing.service import Selection, quote_selection
from app.modules.scheduling.engine import employee_range
from app.modules.scheduling.service import load_schedule, qualified_employees
from app.modules.site.models import BookingPolicy

_REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32, no I/L/O/U
_EXCLUSION_VIOLATION = "23P01"
_UNIQUE_VIOLATION = "23505"


def new_reference() -> str:
    return "AP-" + "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(6))


def manage_token_for(idempotency_key: uuid.UUID) -> str:
    """Derived (not stored) so an idempotent retry can return the same link. Only its hash
    is stored. Possession of the client's idempotency key is equivalent to the link."""
    digest = hmac.new(
        get_settings().secret_key.encode(), b"manage:" + idempotency_key.bytes, hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def _sqlstate(error: IntegrityError) -> str | None:
    return getattr(error.orig, "sqlstate", None)


def _check_window(start: datetime, now: datetime, tz: ZoneInfo, policy: BookingPolicy) -> None:
    if start < now + timedelta(minutes=policy.lead_time_min):
        raise AppError(409, "SLOT_UNAVAILABLE", "Too soon to book this time")
    if start.astimezone(tz).date() > now.astimezone(tz).date() + timedelta(
        days=policy.horizon_days
    ):
        raise AppError(409, "SLOT_UNAVAILABLE", "Too far ahead")


def _get_or_create_customer(
    session: Session, name: str, phone: str, email: str | None
) -> uuid.UUID:
    created = session.scalar(
        insert(Customer)
        .values(id=uuid.uuid4(), phone_e164=phone, name=name, email=email)
        .on_conflict_do_nothing(index_elements=["phone_e164"])
        .returning(Customer.id)
    )
    # An existing customer's data is never overwritten by a public request.
    return created or session.scalar(select(Customer.id).where(Customer.phone_e164 == phone))


def _items(quote: Quote, vehicle_id: int) -> list[BookingItem]:
    return [
        BookingItem(
            service_id=line.service.id,
            role=line.role,
            name_i18n=line.service.name_i18n,
            options=[
                {
                    "code": o.code,
                    "name_i18n": o.name_i18n,
                    "price_kzt": o.cells[vehicle_id][0],
                    "duration_min": o.cells[vehicle_id][1],
                }
                for o in line.options
            ],
            price_kzt=line.price_kzt,
            duration_min=line.duration_min,
            sort_order=i,
        )
        for i, line in enumerate(quote.lines)
    ]


def create_booking(
    session: Session,
    *,
    selection: Selection,
    starts_at: datetime,
    customer_name: str,
    customer_phone: str,
    customer_email: str | None,
    vehicle_note: str | None,
    comment: str | None,
    idempotency_key: uuid.UUID,
    policy: BookingPolicy,
    tz: ZoneInfo,
    now: datetime,
    staff: CurrentUser | None = None,  # set for bookings made by staff in the admin panel
    employee_id: int | None = None,  # staff may pick the employee
    status: str = "pending",
) -> tuple[Booking, bool]:
    """Returns (booking, created). `created` is False for an idempotent replay.

    Public bookings must respect lead time, horizon and the per-phone limit; staff bookings
    (phone calls, walk-ins) skip those but still need a free employee and a future start.
    """
    existing = session.scalar(select(Booking).where(Booking.idempotency_key == idempotency_key))
    if existing:
        return existing, False

    if staff is None:
        _check_window(starts_at, now, tz, policy)
    elif starts_at <= now:
        raise AppError(409, "SLOT_UNAVAILABLE", "Start time is in the past")
    quote, vehicle_id = quote_selection(session, selection, now.astimezone(tz).date())

    active = (
        0
        if staff
        else session.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.customer_phone == customer_phone,
                Booking.status.in_(ACTIVE_STATUSES),
                Booking.starts_at > now,
            )
        )
    )
    if active >= policy.max_active_per_phone:
        raise AppError(409, "TOO_MANY_ACTIVE_BOOKINGS", "This phone already has upcoming bookings")

    service_ids = [line.service.id for line in quote.lines]
    employees = qualified_employees(session, service_ids)
    if employee_id is not None:
        if employee_id not in employees:
            raise AppError(409, "EMPLOYEE_NOT_QUALIFIED", "This employee can't do these services")
        employees = [employee_id]
    day = starts_at.astimezone(tz).date()
    data = load_schedule(session, tz, employees, day, day)
    candidates = []
    for employee in employees:
        times = employee_range(data, employee, starts_at, quote.duration_min, policy.buffer_min)
        if times:
            load = sum((e - s).total_seconds() for s, e in data.busy.get(employee, []))
            candidates.append((load, employee, times))
    candidates.sort()

    customer_id = _get_or_create_customer(session, customer_name, customer_phone, customer_email)
    for _, employee, (ends_at, blocked_until) in candidates:
        booking = Booking(
            reference=new_reference(),
            manage_token_hash=token_hash(manage_token_for(idempotency_key)),
            idempotency_key=idempotency_key,
            customer_id=customer_id,
            employee_id=employee,
            vehicle_category_id=vehicle_id,
            starts_at=starts_at,
            ends_at=ends_at,
            blocked_until=blocked_until,
            status=status,
            source="admin" if staff else "web",
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_email=customer_email,
            vehicle_note=vehicle_note,
            customer_comment=comment,
            locale=selection.locale,
            subtotal_kzt=quote.subtotal_kzt,
            discount_kzt=quote.discount_kzt,
            total_kzt=quote.total_kzt,
            discount_rule_id=quote.discount.id if quote.discount else None,
            discount_name_i18n=quote.discount.name_i18n if quote.discount else None,
            items=_items(quote, vehicle_id),
        )
        savepoint = session.begin_nested()
        try:
            session.add(booking)
            session.flush()
        except IntegrityError as error:
            savepoint.rollback()
            if _sqlstate(error) == _EXCLUSION_VIOLATION:
                continue  # taken a moment ago by a concurrent request: try the next employee
            if _sqlstate(error) == _UNIQUE_VIOLATION and "idempotency_key" in str(error.orig):
                # The same request raced itself: return the booking the other one created.
                replay = session.scalar(
                    select(Booking).where(Booking.idempotency_key == idempotency_key)
                )
                if replay:
                    return replay, False
            raise
        savepoint.commit()
        record(
            session,
            action="booking.created",
            entity_type="booking",
            entity_id=booking.id,
            actor_kind="user" if staff else "public",
            actor_user_id=staff.id if staff else None,
            after={
                "reference": booking.reference,
                "status": booking.status,
                "starts_at": starts_at.isoformat(),
                "employee_id": employee,
                "total_kzt": booking.total_kzt,
            },
        )
        return booking, True

    raise AppError(409, "SLOT_UNAVAILABLE", "This time is no longer available")


def find_by_token(session: Session, token: str) -> Booking:
    booking = session.scalar(select(Booking).where(Booking.manage_token_hash == token_hash(token)))
    if booking is None:
        raise AppError(404, "BOOKING_NOT_FOUND")
    return booking


def cancel_deadline(booking: Booking, policy: BookingPolicy) -> datetime:
    return booking.starts_at - timedelta(hours=policy.cancel_cutoff_hours)


def can_cancel(booking: Booking, policy: BookingPolicy, now: datetime) -> bool:
    return booking.status in ("pending", "confirmed") and now < cancel_deadline(booking, policy)


def cancel_by_customer(
    session: Session, booking: Booking, reason: str | None, policy: BookingPolicy, now: datetime
) -> Booking:
    if not can_cancel(booking, policy, now):
        raise AppError(409, "CANCEL_NOT_ALLOWED", "Too late to cancel online, or already closed")
    before = booking.status
    booking.status = "cancelled"
    booking.cancelled_at = now
    booking.cancel_reason = reason
    record(
        session,
        action="booking.cancelled",
        entity_type="booking",
        entity_id=booking.id,
        before={"status": before},
        after={"status": "cancelled", "by": "customer"},
    )
    return booking


def local_parts(moment: datetime, tz: ZoneInfo) -> tuple[date, str]:
    local = moment.astimezone(tz)
    return local.date(), local.strftime("%H:%M")


# --- staff operations ---------------------------------------------------------------------

TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"in_progress", "cancelled", "no_show"},
    "in_progress": {"completed", "cancelled"},
}
WORK_STATUSES = {"in_progress", "completed"}  # what employees may set on their own jobs


def change_status(
    session: Session,
    booking: Booking,
    new_status: str,
    *,
    user: CurrentUser,
    may_manage: bool,
    final_amount_kzt: int | None,
    reason: str | None,
    now: datetime,
) -> None:
    """Applies one step of the booking state machine.

    pending → confirmed | cancelled;  confirmed → in_progress | cancelled | no_show;
    in_progress → completed (needs the amount actually charged) | cancelled (owner/admin).
    """
    if new_status not in TRANSITIONS.get(booking.status, set()):
        raise AppError(409, "INVALID_TRANSITION", f"{booking.status} → {new_status} is not allowed")
    if not may_manage and new_status not in WORK_STATUSES:
        raise AppError(403, "FORBIDDEN", "Employees can only start and finish jobs")
    if (
        booking.status == "in_progress"
        and new_status == "cancelled"
        and user.role
        not in (
            "owner",
            "admin",
        )
    ):
        raise AppError(403, "FORBIDDEN", "Only an owner or admin can cancel a job in progress")
    if new_status == "no_show" and now < booking.starts_at:
        raise AppError(409, "INVALID_TRANSITION", "No-show can be set only after the start time")
    if new_status == "completed" and final_amount_kzt is None:
        raise AppError(422, "FINAL_AMOUNT_REQUIRED", "Enter the amount actually charged")

    before = {"status": booking.status}
    booking.status = new_status
    after: dict = {"status": new_status}
    if new_status == "completed":
        booking.final_amount_kzt = after["final_amount_kzt"] = final_amount_kzt
    if new_status == "cancelled":
        booking.cancelled_at = now
        booking.cancel_reason = after["reason"] = reason
    record(
        session,
        action="booking.status_changed",
        entity_type="booking",
        entity_id=booking.id,
        actor_kind="user",
        actor_user_id=user.id,
        before=before,
        after=after,
    )


def reschedule(
    session: Session,
    booking: Booking,
    *,
    starts_at: datetime,
    employee_id: int | None,
    user: CurrentUser,
    policy: BookingPolicy,
    tz: ZoneInfo,
    now: datetime,
) -> None:
    """Move a booking to another time and/or employee; the same overlap guard applies."""
    if booking.status not in ("pending", "confirmed"):
        raise AppError(409, "INVALID_TRANSITION", "Only pending or confirmed bookings can move")
    if starts_at <= now:
        raise AppError(409, "SLOT_UNAVAILABLE", "Start time is in the past")
    target = employee_id if employee_id is not None else booking.employee_id
    services = [item.service_id for item in booking.items]
    if target not in qualified_employees(session, services):
        raise AppError(409, "EMPLOYEE_NOT_QUALIFIED", "This employee can't do these services")
    minutes = sum(item.duration_min for item in booking.items)
    day = starts_at.astimezone(tz).date()
    data = load_schedule(session, tz, [target], day, day, exclude_booking=booking.id)
    times = employee_range(data, target, starts_at, minutes, policy.buffer_min)
    if times is None:
        raise AppError(409, "SLOT_UNAVAILABLE", "The employee isn't free at that time")

    before = {"starts_at": booking.starts_at.isoformat(), "employee_id": booking.employee_id}
    savepoint = session.begin_nested()
    booking.starts_at, booking.employee_id = starts_at, target
    booking.ends_at, booking.blocked_until = times
    try:
        session.flush()
    except IntegrityError as error:
        savepoint.rollback()
        if _sqlstate(error) == _EXCLUSION_VIOLATION:
            raise AppError(409, "SLOT_UNAVAILABLE", "Taken a moment ago") from error
        raise
    savepoint.commit()
    record(
        session,
        action="booking.rescheduled",
        entity_type="booking",
        entity_id=booking.id,
        actor_kind="user",
        actor_user_id=user.id,
        before=before,
        after={"starts_at": starts_at.isoformat(), "employee_id": target},
    )
