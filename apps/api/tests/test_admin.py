"""Admin API flows: booking management, scoping, catalog, schedules, settings, audit.

Uses the frozen clock (Mon 2026-11-23 09:00 Astana) and the demo seed from test_booking_api.
"""

import uuid
from datetime import timedelta

from sqlalchemy import select

from app.modules.audit.models import AuditLog
from app.modules.bookings.models import Booking
from tests.test_booking_api import MON, TUE, V1, at, book

ADMIN = "/api/v1/admin"


def new_booking(api, starts_at=None, **kw) -> dict:
    res = book(api, starts_at or at(TUE, 10), **kw)
    assert res.status_code == 201, res.text
    return res.json()["booking"]


def booking_id(seeded, reference: str) -> uuid.UUID:
    return seeded.scalar(select(Booking.id).where(Booking.reference == reference))


def set_status(api, headers, bid, status, **extra):
    return api.post(
        f"{ADMIN}/bookings/{bid}/status", json={"status": status, **extra}, headers=headers
    )


# --- bookings ------------------------------------------------------------------------------


def test_manager_confirms_and_the_change_is_audited(api, auth, clock, seeded, staff) -> None:
    bid = booking_id(seeded, new_booking(api)["reference"])
    res = set_status(api, auth["manager"], bid, "confirmed")
    assert res.status_code == 200
    detail = res.json()
    assert detail["status"] == "confirmed"
    assert [h["action"] for h in detail["history"]] == ["booking.created", "booking.status_changed"]
    assert detail["history"][1]["actor"] == "Manager"
    audit = seeded.scalars(
        select(AuditLog).where(AuditLog.action == "booking.status_changed")
    ).one()
    assert audit.actor_user_id == staff["manager"].id


def test_status_machine_rules(api, auth, clock, seeded) -> None:
    bid = booking_id(seeded, new_booking(api)["reference"])
    h = auth["manager"]
    bad = set_status(api, h, bid, "completed")
    assert bad.status_code == 409 and bad.json()["code"] == "INVALID_TRANSITION"
    assert set_status(api, h, bid, "confirmed").status_code == 200
    early = set_status(api, h, bid, "no_show")
    assert early.status_code == 409  # can't be a no-show before the start time
    assert set_status(api, h, bid, "in_progress").status_code == 200
    # Cancelling a job in progress is reserved for owner/admin.
    assert set_status(api, h, bid, "cancelled").status_code == 403
    no_amount = set_status(api, h, bid, "completed")
    assert no_amount.status_code == 422 and no_amount.json()["code"] == "FINAL_AMOUNT_REQUIRED"
    done = set_status(api, h, bid, "completed", final_amount_kzt=175_000)
    assert done.status_code == 200 and done.json()["final_amount_kzt"] == 175_000
    assert set_status(api, h, bid, "cancelled").status_code == 409  # final state


def test_employee_sees_and_works_only_own_jobs(api, auth, clock, seeded) -> None:
    mine = new_booking(api, phone="+77001110001")  # Ерлан (the employee's own record)
    theirs = new_booking(api, phone="+77001110002")  # Дмитрий
    mine_id, theirs_id = (
        booking_id(seeded, mine["reference"]),
        booking_id(seeded, theirs["reference"]),
    )
    emp = auth["employee"]

    listed = api.get(f"{ADMIN}/bookings", headers=emp).json()
    assert [b["reference"] for b in listed["items"]] == [mine["reference"]]
    assert api.get(f"{ADMIN}/bookings/{theirs_id}", headers=emp).status_code == 404
    # Employees can't confirm; a manager does.
    assert set_status(api, emp, mine_id, "confirmed").status_code == 403
    assert set_status(api, auth["manager"], mine_id, "confirmed").status_code == 200
    assert set_status(api, auth["manager"], theirs_id, "confirmed").status_code == 200
    # Starting your own job works; touching a colleague's looks like it doesn't exist.
    assert set_status(api, emp, mine_id, "in_progress").status_code == 200
    assert set_status(api, emp, theirs_id, "in_progress").status_code == 404
    assert (
        api.patch(
            f"{ADMIN}/bookings/{mine_id}", json={"internal_notes": "x"}, headers=emp
        ).status_code
        == 403
    )


def test_reschedule_reassign_and_conflicts(api, auth, clock, seeded) -> None:
    first = booking_id(seeded, new_booking(api, phone="+77001110001")["reference"])
    second = booking_id(seeded, new_booking(api, phone="+77001110002")["reference"])
    h = auth["manager"]
    erlan, dmitry = (
        seeded.get(Booking, first).employee_id,
        seeded.get(Booking, second).employee_id,
    )

    # Moving the first booking onto the second's employee at the same time collides.
    clash = api.post(f"{ADMIN}/bookings/{first}/assign", json={"employee_id": dmitry}, headers=h)
    assert clash.status_code == 409 and clash.json()["code"] == "SLOT_UNAVAILABLE"

    moved = api.post(
        f"{ADMIN}/bookings/{first}/reschedule",
        json={"starts_at": at(TUE + timedelta(days=1), 9).isoformat()},
        headers=h,
    )
    assert moved.status_code == 200
    assert moved.json()["starts_at"].startswith("2026-11-25T09:00")
    assert moved.json()["history"][-1]["action"] == "booking.rescheduled"

    # PPF needs Дмитрий's skills: Ерлан can't take it.
    ppf = booking_id(
        seeded,
        new_booking(api, at(TUE + timedelta(days=2), 10), service="ppf", phone="+77001110003")[
            "reference"
        ],
    )
    wrong = api.post(f"{ADMIN}/bookings/{ppf}/assign", json={"employee_id": erlan}, headers=h)
    assert wrong.status_code == 409 and wrong.json()["code"] == "EMPLOYEE_NOT_QUALIFIED"
    past = api.post(
        f"{ADMIN}/bookings/{ppf}/reschedule", json={"starts_at": at(MON, 8).isoformat()}, headers=h
    )
    assert past.status_code == 409


def test_staff_booking_skips_lead_time_and_is_confirmed(api, auth, clock, seeded, staff) -> None:
    res = api.post(
        f"{ADMIN}/bookings",
        headers=auth["manager"] | {"Idempotency-Key": str(uuid.uuid4())},
        json={
            "selection": {"service": "headlight-restoration", "vehicle": "sedan"},
            "starts_at": at(MON, 10).isoformat(),  # inside the public 2-hour lead time
            "customer": {"name": "По телефону", "phone": "8 701 222 33 44"},
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "confirmed" and body["source"] == "admin"
    assert body["customer_phone"] == "+77012223344"
    assert body["history"][0]["actor"] == "Manager"


def test_booking_list_filters_and_search(api, auth, clock, seeded) -> None:
    a = new_booking(api, phone="+77001110001")
    new_booking(api, at(TUE + timedelta(days=1), 10), phone="+77001110002")
    h = auth["manager"]
    by_day = api.get(
        f"{ADMIN}/bookings", params={"date_from": TUE, "date_to": TUE}, headers=h
    ).json()
    assert by_day["total"] == 1 and by_day["items"][0]["reference"] == a["reference"]
    by_ref = api.get(f"{ADMIN}/bookings", params={"q": a["reference"][-4:]}, headers=h).json()
    assert [i["reference"] for i in by_ref["items"]] == [a["reference"]]
    paged = api.get(
        f"{ADMIN}/bookings", params={"page_size": 1, "sort": "-starts_at"}, headers=h
    ).json()
    assert paged["total"] == 2 and len(paged["items"]) == 1
    assert api.get(f"{ADMIN}/bookings", params={"page_size": 1000}, headers=h).status_code == 422


# --- customers ------------------------------------------------------------------------------


def test_customer_search_history_and_notes(api, auth, clock) -> None:
    new_booking(api, phone="+77005556677")
    h = auth["manager"]
    found = api.get(f"{ADMIN}/customers", params={"q": "5556677"}, headers=h).json()
    assert found["total"] == 1 and found["items"][0]["bookings"] == 1
    cid = found["items"][0]["id"]
    patched = api.patch(
        f"{ADMIN}/customers/{cid}", json={"notes": "VIP, керамика каждый год"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["notes"].startswith("VIP")
    assert len(patched.json()["history"]) == 1
    assert patched.json()["history"][0]["starts_at"] == "2026-11-24T10:00:00+05:00"  # business time
    assert api.get(f"{ADMIN}/customers", headers=auth["employee"]).status_code == 403


# --- catalog & pricing ------------------------------------------------------------------------


def test_price_matrix_change_reaches_quotes_but_not_existing_bookings(
    api, auth, clock, seeded
) -> None:
    old = new_booking(api, service="headlight-restoration")
    h = auth["admin"]
    sid = next(
        s["id"]
        for s in api.get(f"{ADMIN}/services", headers=h).json()
        if s["slug"] == "headlight-restoration"
    )
    matrix = api.get(f"{ADMIN}/services/{sid}/prices", headers=h).json()
    for cell in matrix["entries"]:
        if cell["option_code"] is None:
            cell["price_kzt"] += 5_000
    assert api.put(f"{ADMIN}/services/{sid}/prices", json=matrix, headers=h).status_code == 200

    quote = api.post(f"{V1}/quotes", json={"service": "headlight-restoration", "vehicle": "sedan"})
    assert quote.json()["total_kzt"] == 30_000
    assert (
        seeded.scalar(select(Booking.total_kzt).where(Booking.reference == old["reference"]))
        == 25_000
    )

    bad = {
        "entries": [
            {"option_code": None, "vehicle_code": "sedan", "price_kzt": 1, "duration_min": 0}
        ]
    }
    assert (
        api.put(f"{ADMIN}/services/{sid}/prices", json=bad, headers=h).json()["code"]
        == "DURATION_REQUIRED"
    )
    # Managers can read the catalog but not change prices.
    assert (
        api.put(f"{ADMIN}/services/{sid}/prices", json=matrix, headers=auth["manager"]).status_code
        == 403
    )


def test_service_with_bookings_is_archived_not_deleted(api, auth, clock) -> None:
    new_booking(api, service="headlight-restoration")
    h = auth["admin"]
    services = {s["slug"]: s["id"] for s in api.get(f"{ADMIN}/services", headers=h).json()}
    res = api.delete(f"{ADMIN}/services/{services['headlight-restoration']}", headers=h)
    assert res.status_code == 200 and res.json() == {"archived": True}
    assert api.get(f"{V1}/services/headlight-restoration").status_code == 404  # hidden publicly


def test_duplicate_slug_and_missing_translation_are_rejected(api, auth) -> None:
    h = auth["admin"]
    dup = api.post(
        f"{ADMIN}/service-categories",
        headers=h,
        json={"slug": "interior", "name_i18n": {"ru": "Салон"}},
    )
    assert dup.status_code == 409
    no_ru = api.post(
        f"{ADMIN}/service-categories",
        headers=h,
        json={"slug": "wheels", "name_i18n": {"en": "Wheels"}},
    )
    assert no_ru.status_code == 422


def test_discount_rules_crud_affects_quotes(api, auth) -> None:
    h = auth["admin"]
    rule = api.post(
        f"{ADMIN}/discount-rules",
        headers=h,
        json={
            "kind": "bundle",
            "name_i18n": {"ru": "Фары + тонировка"},
            "percent": 20,
            "service_slugs": ["headlight-restoration", "window-tinting"],
        },
    )
    assert rule.status_code == 201, rule.text
    quote = api.post(
        f"{V1}/quotes",
        json={"service": "window-tinting", "vehicle": "sedan", "addons": ["headlight-restoration"]},
    ).json()
    assert quote["discount"] == {"name": "Фары + тонировка", "amount_kzt": 12_000}
    assert api.delete(f"{ADMIN}/discount-rules/{rule.json()['id']}", headers=h).status_code == 204
    invalid = api.post(
        f"{ADMIN}/discount-rules",
        headers=h,
        json={
            "kind": "bundle",
            "name_i18n": {"ru": "x"},
            "percent": 10,
            "amount_kzt": 100,
            "service_slugs": ["ppf", "window-tinting"],
        },
    )
    assert invalid.status_code == 422


# --- schedules, settings, audit -----------------------------------------------------------------


def test_holiday_and_schedule_management(api, auth, clock) -> None:
    h = auth["manager"]
    res = api.post(
        f"{ADMIN}/schedule-exceptions",
        headers=h,
        json={"day": TUE.isoformat(), "reason": "Праздник"},
    )
    assert res.status_code == 201
    slots = api.get(
        f"{V1}/availability",
        params={"service": "ceramic-coating", "vehicle": "sedan", "date_from": TUE, "date_to": TUE},
    ).json()
    assert slots["days"][0]["slots"] == []
    assert (
        api.post(
            f"{ADMIN}/schedule-exceptions", headers=h, json={"day": TUE.isoformat()}
        ).status_code
        == 409
    )

    employees = api.get(f"{ADMIN}/employees", headers=h).json()
    erlan = next(e for e in employees if e["display_name"] == "Ерлан С.")
    overlap = api.put(
        f"{ADMIN}/employees/{erlan['id']}/schedule",
        headers=h,
        json={
            "intervals": [
                {"weekday": 1, "starts": "09:00", "ends": "13:00"},
                {"weekday": 1, "starts": "12:00", "ends": "18:00"},
            ]
        },
    )
    assert overlap.status_code == 422 and overlap.json()["code"] == "OVERLAPPING_INTERVALS"
    ok = api.put(
        f"{ADMIN}/employees/{erlan['id']}/schedule",
        headers=h,
        json={
            "intervals": [
                {"weekday": 1, "starts": "09:00", "ends": "13:00"},
                {"weekday": 1, "starts": "14:00", "ends": "18:00"},
            ]
        },
    )
    assert ok.status_code == 200 and len(ok.json()["schedule"]) == 2
    # Skills are staff management: managers can't change them.
    assert (
        api.put(
            f"{ADMIN}/employees/{erlan['id']}/services", headers=h, json={"service_ids": []}
        ).status_code
        == 403
    )


def test_settings_are_validated_and_published(api, auth) -> None:
    h = auth["admin"]
    settings = api.get(f"{ADMIN}/settings", headers=h).json()
    bad = api.put(f"{ADMIN}/settings", headers=h, json={**settings, "phone": "8 700"})
    assert bad.status_code == 422
    good = api.put(f"{ADMIN}/settings", headers=h, json={**settings, "business_name": "Studio X"})
    assert good.status_code == 200
    assert api.get(f"{V1}/site").json()["business_name"] == "Studio X"
    assert api.put(f"{ADMIN}/settings", headers=auth["manager"], json=settings).status_code == 403


def test_audit_log_lists_admin_actions_for_owner_only(api, auth) -> None:
    api.put(
        f"{ADMIN}/business-hours",
        headers=auth["owner"],
        json={"intervals": [{"weekday": 1, "starts": "10:00", "ends": "19:00"}]},
    )
    page = api.get(
        f"{ADMIN}/audit-logs", params={"entity_type": "settings"}, headers=auth["owner"]
    ).json()
    entry = page["items"][0]
    assert entry["action"] == "business_hours.set" and entry["actor_name"] == "Owner"
    assert entry["after"]["hours"][0]["starts"] == "10:00:00"
    assert api.get(f"{ADMIN}/audit-logs", headers=auth["manager"]).status_code == 403


# --- analytics ---------------------------------------------------------------------------------


def test_dashboard_counts_and_recorded_revenue_only(api, auth, clock, seeded) -> None:
    done = booking_id(seeded, new_booking(api, phone="+77001110001")["reference"])
    new_booking(api, phone="+77001110002")  # stays pending: never counted as revenue
    h = auth["manager"]
    for status, extra in (
        ("confirmed", {}),
        ("in_progress", {}),
        ("completed", {"final_amount_kzt": 170_000}),
    ):
        assert set_status(api, h, done, status, **extra).status_code == 200
    data = api.get(
        f"{ADMIN}/analytics", params={"date_from": MON, "date_to": TUE}, headers=h
    ).json()
    assert data["today"] == "2026-11-23"
    assert data["bookings"] == 2 and data["completed"] == 1
    assert data["revenue_kzt"] == 170_000  # the recorded amount, not the 180 000 price
    assert data["pending_upcoming"] == 1
    assert [d["date"] for d in data["days"]] == ["2026-11-23", "2026-11-24"]
    assert data["days"][1] == {
        "date": "2026-11-24",
        "bookings": 2,
        "completed": 1,
        "revenue_kzt": 170_000,
    }
    assert api.get(f"{ADMIN}/analytics", headers=auth["employee"]).status_code == 403
    too_long = api.get(
        f"{ADMIN}/analytics", params={"date_from": "2025-01-01", "date_to": TUE}, headers=h
    )
    assert too_long.status_code == 422


def test_demo_users_are_never_created_in_production(seeded, monkeypatch) -> None:
    from app.config import Settings
    from app.seed import seed_demo_users

    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: Settings(environment="production", secret_key="x" * 40),
    )
    assert seed_demo_users(seeded) is False
