"""Quotes, availability and bookings through the HTTP API (real PostgreSQL, demo seed).

The clock is frozen at Monday 2026-11-23 09:00 in Astana. Seeded staff:
Ерлан Mon–Fri 09–18 (ceramic, polish, …), Дмитрий Tue–Sat 10–19 (PPF, ceramic, …).
"""

import re
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.modules.audit.models import AuditLog
from app.modules.bookings.models import Booking
from app.modules.customers.models import Customer
from app.modules.scheduling.models import ScheduleException
from app.modules.staff.models import Employee

TZ = ZoneInfo("Asia/Almaty")
V1 = "/api/v1/public"
MON = date(2026, 11, 23)
TUE = MON + timedelta(days=1)


def at(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm), TZ)


@pytest.fixture
def clock(monkeypatch):
    state = {"now": at(MON, 9)}
    monkeypatch.setattr("app.modules.bookings.public.utcnow", lambda: state["now"])
    return state


def body(starts_at: datetime, phone="+77001112233", service="ceramic-coating", **extra) -> dict:
    return {
        "selection": {"service": service, "vehicle": "sedan", "options": [], "addons": []},
        "starts_at": starts_at.isoformat(),
        "customer": {"name": "Айдос", "phone": phone},
        "consent": True,
        **extra,
    }


def book(api, starts_at, key=None, **kw):
    return api.post(
        f"{V1}/bookings",
        json=body(starts_at, **kw),
        headers={"Idempotency-Key": str(key or uuid.uuid4())},
    )


def employee_id(session, name: str) -> int:
    return session.scalar(select(Employee.id).where(Employee.display_name == name))


# --- quotes ----------------------------------------------------------------------------


def test_quote_applies_best_discount(api) -> None:
    res = api.post(
        f"{V1}/quotes",
        json={
            "service": "exterior-detailing",
            "vehicle": "sedan",
            "addons": ["interior-detailing"],
        },
    )
    assert res.status_code == 200
    q = res.json()
    assert q["subtotal_kzt"] == 70_000
    assert q["discount"] == {"name": "Кузов + салон", "amount_kzt": 7_000}
    assert q["total_kzt"] == 63_000


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"service": "nope", "vehicle": "sedan"}, "UNKNOWN_SERVICE"),
        ({"service": "ppf", "vehicle": "truck"}, "UNKNOWN_VEHICLE"),
        (
            {"service": "ppf", "vehicle": "sedan", "addons": ["paint-correction"]},
            "ADDON_NOT_ALLOWED",
        ),
        ({"service": "ppf", "vehicle": "sedan", "price_kzt": 1}, "VALIDATION_ERROR"),
    ],
)
def test_quote_rejects_bad_selections(api, payload, code) -> None:
    res = api.post(f"{V1}/quotes", json=payload)
    assert res.status_code == 422
    assert res.json()["code"] == code


# --- availability ----------------------------------------------------------------------


def availability(api, day_from, day_to, service="ceramic-coating"):
    res = api.get(
        f"{V1}/availability",
        params={"service": service, "vehicle": "sedan", "date_from": day_from, "date_to": day_to},
    )
    assert res.status_code == 200, res.text
    return {d["date"]: [s["time"] for s in d["slots"]] for d in res.json()["days"]}


def test_availability_respects_lead_time_skills_and_closed_days(api, clock) -> None:
    days = availability(api, MON, MON + timedelta(days=6))
    # Ceramic sedan = 8 h. Monday: only Ерлан (9–18) works, and the 2 h lead time from
    # 09:00 means the earliest start is 11:00 — too late to finish 8 h the same day.
    assert days["2026-11-23"] == []
    # Tuesday, 30-minute grid: Ерлан can start 9:00–10:00, Дмитрий 10:00–11:00.
    assert days["2026-11-24"] == ["09:00", "09:30", "10:00", "10:30", "11:00"]
    assert days["2026-11-29"] == []  # Sunday: business closed

    ppf = availability(api, TUE, TUE, service="ppf")  # 24 h job, Дмитрий only, spans days
    assert ppf["2026-11-24"][0] == "10:00"


def test_availability_range_is_limited(api) -> None:
    res = api.get(
        f"{V1}/availability",
        params={
            "service": "ppf",
            "vehicle": "sedan",
            "date_from": MON,
            "date_to": MON + timedelta(days=40),
        },
    )
    assert res.status_code == 422
    assert res.json()["code"] == "INVALID_RANGE"


def test_slot_times_carry_the_business_offset(api, clock) -> None:
    res = api.get(
        f"{V1}/availability",
        params={
            "service": "headlight-restoration",
            "vehicle": "sedan",
            "date_from": TUE,
            "date_to": TUE,
        },
    )
    first = res.json()["days"][0]["slots"][0]
    assert first == {"start": "2026-11-24T09:00:00+05:00", "time": "09:00"}


# --- booking creation ------------------------------------------------------------------


def test_create_booking_snapshots_price_assigns_employee_and_audits(api, clock, seeded) -> None:
    res = book(api, at(TUE, 10), comment="Есть сколы на капоте")
    assert res.status_code == 201, res.text
    data = res.json()
    b = data["booking"]
    assert re.fullmatch(r"AP-[0-9A-HJKMNP-TV-Z]{6}", b["reference"])
    assert b["status"] == "pending"
    assert b["starts"] == {"date": "2026-11-24", "time": "10:00"}
    assert b["ends"] == {"date": "2026-11-24", "time": "18:00"}
    assert b["starts_at"] == "2026-11-24T10:00:00+05:00"
    assert b["total_kzt"] == 180_000
    assert b["lines"][0]["options"] == ["1 слой"]
    assert b["phone_masked"] == "+7700*****33"
    assert b["can_cancel"] is True
    assert len(data["manage_token"]) >= 40

    row = seeded.scalar(select(Booking).where(Booking.reference == b["reference"]))
    assert row.employee_id == employee_id(seeded, "Ерлан С.")  # least loaded, first in order
    assert row.blocked_until == at(TUE, 18, 30)  # + 30 min buffer
    assert row.customer_comment == "Есть сколы на капоте"
    assert row.items[0].price_kzt == 180_000
    assert row.manage_token_hash != data["manage_token"].encode()  # only the hash is stored
    audit = seeded.scalar(select(AuditLog).where(AuditLog.entity_id == str(row.id)))
    assert audit.action == "booking.created" and audit.actor_kind == "public"


def test_second_customer_gets_the_other_employee_then_slot_is_full(api, clock, seeded) -> None:
    assert book(api, at(TUE, 10), phone="+77001110001").status_code == 201
    assert book(api, at(TUE, 10), phone="+77001110002").status_code == 201
    third = book(api, at(TUE, 10), phone="+77001110003")
    assert third.status_code == 409
    assert third.json()["code"] == "SLOT_UNAVAILABLE"

    employees = seeded.scalars(select(Booking.employee_id)).all()
    assert sorted(employees) == sorted(
        [employee_id(seeded, "Ерлан С."), employee_id(seeded, "Дмитрий К.")]
    )
    assert "10:00" not in availability(api, TUE, TUE)["2026-11-24"]


def test_idempotent_retry_returns_the_same_booking(api, clock, seeded) -> None:
    key = uuid.uuid4()
    first = book(api, at(TUE, 10), key=key)
    again = book(api, at(TUE, 10), key=key)
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json() == first.json()
    assert seeded.scalar(select(Booking.id).where(Booking.idempotency_key == key))
    assert len(seeded.scalars(select(Booking)).all()) == 1


@pytest.mark.parametrize(
    "starts_at",
    [
        at(TUE, 8),  # before opening
        at(TUE, 13),  # 8 h job can't finish the same day
        at(MON, 10),  # inside the 2 h lead time
        at(MON + timedelta(days=6), 10),  # Sunday, closed
        at(MON + timedelta(days=70), 10),  # beyond the 60-day horizon
    ],
)
def test_invalid_start_times_are_rejected(api, clock, starts_at) -> None:
    res = book(api, starts_at)
    assert res.status_code == 409
    assert res.json()["code"] == "SLOT_UNAVAILABLE"


def test_business_holiday_blocks_booking(api, clock, seeded) -> None:
    seeded.add(ScheduleException(employee_id=None, day=TUE, is_closed=True, reason="Праздник"))
    seeded.flush()
    assert availability(api, TUE, TUE)["2026-11-24"] == []
    assert book(api, at(TUE, 10)).json()["code"] == "SLOT_UNAVAILABLE"


def test_employee_day_off_moves_booking_to_colleague(api, clock, seeded) -> None:
    seeded.add(
        ScheduleException(employee_id=employee_id(seeded, "Ерлан С."), day=TUE, is_closed=True)
    )
    seeded.flush()
    res = book(api, at(TUE, 10))
    assert res.status_code == 201
    row = seeded.scalar(select(Booking))
    assert row.employee_id == employee_id(seeded, "Дмитрий К.")


@pytest.mark.parametrize(
    ("mutate", "field"),
    [
        (lambda b: b.update(consent=False), "consent"),
        (lambda b: b["customer"].update(phone="12345"), "customer.phone"),
        (lambda b: b["customer"].update(email="not-an-email"), "customer.email"),
        (lambda b: b.update(total_kzt=1), "total_kzt"),  # price can't be sent
        (lambda b: b.update(employee_id=1), "employee_id"),  # nor the employee
        (lambda b: b.update(status="confirmed"), "status"),  # nor the status
    ],
)
def test_booking_validation_and_mass_assignment(api, clock, mutate, field) -> None:
    payload = body(at(TUE, 10))
    mutate(payload)
    res = api.post(f"{V1}/bookings", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())})
    assert res.status_code == 422
    assert field in [e["field"] for e in res.json()["errors"]]


def test_missing_idempotency_key_and_honeypot_are_rejected(api, clock) -> None:
    assert api.post(f"{V1}/bookings", json=body(at(TUE, 10))).status_code == 422
    assert book(api, at(TUE, 10), website="http://spam").status_code == 422


def test_phone_is_normalized_and_existing_customer_is_not_overwritten(api, clock, seeded) -> None:
    assert book(api, at(TUE, 9), phone="8 (700) 123-45-67").status_code == 201
    payload = body(at(TUE, 10), phone="+7 700 123 45 67")
    payload["customer"]["name"] = "Кто-то другой"
    api.post(f"{V1}/bookings", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())})
    customer = seeded.scalar(select(Customer).where(Customer.phone_e164 == "+77001234567"))
    assert customer.name == "Айдос"
    assert len(seeded.scalars(select(Customer)).all()) == 1


def test_too_many_active_bookings_per_phone(api, clock) -> None:
    for day in (1, 2, 3):
        assert (
            book(api, at(MON + timedelta(days=day), 9), service="headlight-restoration").status_code
            == 201
        )
    res = book(api, at(MON + timedelta(days=4), 9), service="headlight-restoration")
    assert res.status_code == 409
    assert res.json()["code"] == "TOO_MANY_ACTIVE_BOOKINGS"


# --- lookup and cancel -----------------------------------------------------------------


def test_lookup_and_cancel_with_manage_token(api, clock) -> None:
    created = book(api, at(TUE, 10)).json()
    token = created["manage_token"]

    looked = api.post(f"{V1}/bookings/lookup", json={"token": token, "locale": "en"})
    assert looked.status_code == 200
    assert looked.json()["lines"][0]["name"] == "Ceramic coating"
    assert looked.json()["phone_masked"].endswith("33")

    cancelled = api.post(
        f"{V1}/bookings/cancel", json={"token": token, "reason": "Планы изменились"}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["can_cancel"] is False
    # The time is free again for someone else.
    assert book(api, at(TUE, 10), phone="+77009998877").status_code == 201


def test_unknown_token_is_404(api) -> None:
    res = api.post(f"{V1}/bookings/lookup", json={"token": "x" * 43})
    assert res.status_code == 404
    assert res.json()["code"] == "BOOKING_NOT_FOUND"


def test_cancel_after_cutoff_is_refused(api, clock) -> None:
    token = book(api, at(TUE, 10)).json()["manage_token"]
    clock["now"] = at(MON, 11)  # 23 h before start; cutoff is 24 h
    res = api.post(f"{V1}/bookings/cancel", json={"token": token})
    assert res.status_code == 409
    assert res.json()["code"] == "CANCEL_NOT_ALLOWED"


def test_rate_limit_returns_429_with_retry_after(api) -> None:
    for _ in range(30):
        api.post(f"{V1}/bookings/lookup", json={"token": "y" * 43})
    res = api.post(f"{V1}/bookings/lookup", json={"token": "y" * 43})
    assert res.status_code == 429
    assert res.json()["code"] == "RATE_LIMITED"
    assert int(res.headers["Retry-After"]) > 0


# --- database guarantee ----------------------------------------------------------------


def test_database_rejects_overlapping_active_bookings(api, clock, seeded) -> None:
    book(api, at(TUE, 10))
    original = seeded.scalar(select(Booking))
    clone = Booking(
        reference="AP-TEST01",
        manage_token_hash=b"0" * 32,
        customer_id=original.customer_id,
        employee_id=original.employee_id,
        vehicle_category_id=original.vehicle_category_id,
        starts_at=at(TUE, 12),
        ends_at=at(TUE, 13),
        blocked_until=at(TUE, 13),
        customer_name="x",
        customer_phone="+77000000000",
        subtotal_kzt=1,
        total_kzt=1,
    )
    seeded.add(clone)
    with pytest.raises(IntegrityError) as exc:
        seeded.flush()
    assert exc.value.orig.sqlstate == "23P01"
    seeded.rollback()

    # Once the original is cancelled it no longer holds the time.
    original = seeded.scalar(select(Booking))
    original.status = "cancelled"
    seeded.flush()
    seeded.add(
        Booking(
            reference="AP-TEST02",
            manage_token_hash=b"1" * 32,
            customer_id=original.customer_id,
            employee_id=original.employee_id,
            vehicle_category_id=original.vehicle_category_id,
            starts_at=at(TUE, 12),
            ends_at=at(TUE, 13),
            blocked_until=at(TUE, 13),
            customer_name="x",
            customer_phone="+77000000000",
            subtotal_kzt=1,
            total_kzt=1,
        )
    )
    seeded.flush()
