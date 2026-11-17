import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Query, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.deps import SessionDep
from app.errors import AppError
from app.i18n import DEFAULT_LOCALE, Locale, pick
from app.modules.bookings import service
from app.modules.bookings.models import Booking
from app.modules.catalog.models import VehicleCategory
from app.modules.customers.models import normalize_phone
from app.modules.pricing.engine import Quote
from app.modules.pricing.service import Code, Selection, quote_selection
from app.modules.scheduling.engine import available_slots
from app.modules.scheduling.service import load_schedule, qualified_employees
from app.modules.site.models import get_site_settings
from app.ratelimit import rate_limit

router = APIRouter(prefix="/public", tags=["booking"])


def utcnow() -> datetime:
    return datetime.now(UTC)


# --- schemas ------------------------------------------------------------------------


class QuoteOption(BaseModel):
    code: str
    name: str
    price_kzt: int


class QuoteLineOut(BaseModel):
    service: str
    name: str
    role: Literal["primary", "addon"]
    base_price_kzt: int
    options: list[QuoteOption]
    price_kzt: int
    duration_min: int


class DiscountOut(BaseModel):
    name: str
    amount_kzt: int


class QuoteOut(BaseModel):
    lines: list[QuoteLineOut]
    subtotal_kzt: int
    discount: DiscountOut | None
    total_kzt: int
    duration_min: int
    currency: Literal["KZT"] = "KZT"


class Slot(BaseModel):
    start: datetime  # with the business timezone offset, e.g. 2026-11-21T10:00:00+05:00
    time: str  # "10:00", business-local


class AvailabilityDay(BaseModel):
    date: date
    slots: list[Slot]


class AvailabilityOut(BaseModel):
    timezone: str
    duration_min: int
    days: list[AvailabilityDay]


class CustomerIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(max_length=30)
    email: str | None = Field(default=None, max_length=200)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        normalized = normalize_phone(value)
        if normalized is None:
            raise ValueError("invalid_phone")
        return normalized

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("invalid_email")
        return value


class BookingIn(BaseModel):
    """No price, employee or status fields: the server decides all of them."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    selection: Selection
    starts_at: AwareDatetime
    customer: CustomerIn
    vehicle_note: str | None = Field(default=None, max_length=200)
    comment: str | None = Field(default=None, max_length=1000)
    consent: Literal[True]  # consent to personal data processing (Law of RK)
    website: str = Field(default="", max_length=200)  # honeypot: humans leave it empty


class TimePoint(BaseModel):
    date: date
    time: str


class BookingLineOut(BaseModel):
    name: str
    role: str
    options: list[str]
    price_kzt: int
    duration_min: int


class BookingOut(BaseModel):
    reference: str
    status: str
    vehicle: str
    lines: list[BookingLineOut]
    starts: TimePoint  # business-local date and time, for display
    ends: TimePoint
    starts_at: datetime  # exact instants (with offset), e.g. for calendar files
    ends_at: datetime
    subtotal_kzt: int
    discount: DiscountOut | None
    total_kzt: int
    customer_name: str
    phone_masked: str
    can_cancel: bool
    cancel_until: TimePoint


class BookingCreated(BaseModel):
    manage_token: str
    booking: BookingOut


class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=100)
    locale: Locale = DEFAULT_LOCALE


class CancelIn(TokenIn):
    reason: str | None = Field(default=None, max_length=500)


# --- helpers ------------------------------------------------------------------------


def _quote_out(quote: Quote, vehicle_id: int, locale: str) -> QuoteOut:
    return QuoteOut(
        lines=[
            QuoteLineOut(
                service=line.service.slug,
                name=pick(line.service.name_i18n, locale),
                role=line.role,
                base_price_kzt=line.base_kzt,
                options=[
                    QuoteOption(
                        code=o.code,
                        name=pick(o.name_i18n, locale),
                        price_kzt=o.cells[vehicle_id][0],
                    )
                    for o in line.options
                ],
                price_kzt=line.price_kzt,
                duration_min=line.duration_min,
            )
            for line in quote.lines
        ],
        subtotal_kzt=quote.subtotal_kzt,
        discount=DiscountOut(
            name=pick(quote.discount.name_i18n, locale), amount_kzt=quote.discount_kzt
        )
        if quote.discount
        else None,
        total_kzt=quote.total_kzt,
        duration_min=quote.duration_min,
    )


def _point(moment: datetime, tz: ZoneInfo) -> TimePoint:
    day, clock = service.local_parts(moment, tz)
    return TimePoint(date=day, time=clock)


def _mask(phone: str) -> str:
    return phone[:5] + "*" * (len(phone) - 7) + phone[-2:]


def _booking_out(session, booking: Booking, locale: str, now: datetime) -> BookingOut:
    settings = get_site_settings(session)
    tz = ZoneInfo(settings.timezone)
    vehicle = session.get(VehicleCategory, booking.vehicle_category_id)
    return BookingOut(
        reference=booking.reference,
        status=booking.status,
        vehicle=pick(vehicle.name_i18n, locale),
        lines=[
            BookingLineOut(
                name=pick(item.name_i18n, locale),
                role=item.role,
                options=[pick(o["name_i18n"], locale) for o in item.options],
                price_kzt=item.price_kzt,
                duration_min=item.duration_min,
            )
            for item in booking.items
        ],
        starts=_point(booking.starts_at, tz),
        ends=_point(booking.ends_at, tz),
        starts_at=booking.starts_at.astimezone(tz),
        ends_at=booking.ends_at.astimezone(tz),
        subtotal_kzt=booking.subtotal_kzt,
        discount=DiscountOut(
            name=pick(booking.discount_name_i18n, locale), amount_kzt=booking.discount_kzt
        )
        if booking.discount_kzt
        else None,
        total_kzt=booking.total_kzt,
        customer_name=booking.customer_name,
        phone_masked=_mask(booking.customer_phone),
        can_cancel=service.can_cancel(booking, settings.booking, now),
        cancel_until=_point(service.cancel_deadline(booking, settings.booking), tz),
    )


# --- endpoints ----------------------------------------------------------------------


@router.post("/quotes", dependencies=[Depends(rate_limit("quote", 120, 60))])
def create_quote(selection: Selection, session: SessionDep) -> QuoteOut:
    tz = ZoneInfo(get_site_settings(session).timezone)
    quote, vehicle_id = quote_selection(session, selection, utcnow().astimezone(tz).date())
    return _quote_out(quote, vehicle_id, selection.locale)


@router.get("/availability", dependencies=[Depends(rate_limit("availability", 60, 60))])
def get_availability(
    session: SessionDep,
    service_slug: Annotated[Code, Query(alias="service")],
    vehicle: Code,
    date_from: date,
    date_to: date,
    options: Annotated[list[Code], Query(max_length=10)] = [],  # noqa: B006 - FastAPI query list
    addons: Annotated[list[Code], Query(max_length=5)] = [],  # noqa: B006
) -> AvailabilityOut:
    if not date_from <= date_to <= date_from + timedelta(days=30):
        raise AppError(422, "INVALID_RANGE", "date_to must be within 31 days after date_from")
    settings = get_site_settings(session)
    policy, tz = settings.booking, ZoneInfo(settings.timezone)
    now = utcnow()
    selection = Selection(service=service_slug, vehicle=vehicle, options=options, addons=addons)
    quote, _ = quote_selection(session, selection, now.astimezone(tz).date())

    employees = qualified_employees(session, [line.service.id for line in quote.lines])
    data = load_schedule(session, tz, employees, date_from, date_to)
    days = available_slots(
        data,
        employees,
        quote.duration_min,
        date_from=date_from,
        date_to=date_to,
        earliest=now + timedelta(minutes=policy.lead_time_min),
        last_day=now.astimezone(tz).date() + timedelta(days=policy.horizon_days),
        step_min=policy.slot_step_min,
        buffer_min=policy.buffer_min,
    )
    return AvailabilityOut(
        timezone=settings.timezone,
        duration_min=quote.duration_min,
        days=[
            AvailabilityDay(
                date=day,
                slots=[Slot(start=s, time=s.astimezone(tz).strftime("%H:%M")) for s in starts],
            )
            for day, starts in days.items()
        ],
    )


@router.post(
    "/bookings",
    status_code=201,
    dependencies=[Depends(rate_limit("booking", 10, 3600))],
    responses={200: {"description": "Idempotent replay of an earlier identical request"}},
)
def create_booking(
    body: BookingIn,
    session: SessionDep,
    response: Response,
    idempotency_key: Annotated[uuid.UUID, Header(alias="Idempotency-Key")],
) -> BookingCreated:
    if body.website:
        raise AppError(422, "VALIDATION_ERROR", "Request rejected")
    settings = get_site_settings(session)
    now = utcnow()
    booking, created = service.create_booking(
        session,
        selection=body.selection,
        starts_at=body.starts_at,
        customer_name=body.customer.name,
        customer_phone=body.customer.phone,
        customer_email=body.customer.email,
        vehicle_note=body.vehicle_note or None,
        comment=body.comment or None,
        idempotency_key=idempotency_key,
        policy=settings.booking,
        tz=ZoneInfo(settings.timezone),
        now=now,
    )
    session.commit()
    if not created:
        response.status_code = 200
    return BookingCreated(
        manage_token=service.manage_token_for(idempotency_key),
        booking=_booking_out(session, booking, body.selection.locale, now),
    )


@router.post("/bookings/lookup", dependencies=[Depends(rate_limit("lookup", 30, 60))])
def lookup_booking(body: TokenIn, session: SessionDep) -> BookingOut:
    booking = service.find_by_token(session, body.token)
    return _booking_out(session, booking, body.locale, utcnow())


@router.post("/bookings/cancel", dependencies=[Depends(rate_limit("cancel", 10, 3600))])
def cancel_booking(body: CancelIn, session: SessionDep) -> BookingOut:
    booking = service.find_by_token(session, body.token)
    settings = get_site_settings(session)
    now = utcnow()
    service.cancel_by_customer(session, booking, body.reason, settings.booking, now)
    session.commit()
    return _booking_out(session, booking, body.locale, now)
