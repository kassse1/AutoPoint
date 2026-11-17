"""Phase 6: notification outbox + Telegram, contact form, image uploads, gallery & reviews."""

import io
import json
import time
import urllib.error
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image
from sqlalchemy import select, text

from app.config import get_settings
from app.modules.contact.models import ContactMessage
from app.modules.contact.public import _sign
from app.modules.notifications import telegram
from app.modules.notifications.models import Notification
from app.modules.notifications.telegram import MAX_ATTEMPTS, SendResult, process_batch, render
from tests.test_booking_api import TUE, V1, at, book

ADMIN = "/api/v1/admin"
NOW = datetime(2026, 11, 23, 4, 0, tzinfo=UTC)


def outbox(session, event_type=None) -> list[Notification]:
    query = select(Notification).order_by(Notification.id)
    if event_type:
        query = query.where(Notification.event_type == event_type)
    return list(session.scalars(query))


# --- outbox content ------------------------------------------------------------------------


def test_booking_events_are_queued_without_customer_data(api, auth, clock, seeded) -> None:
    created = book(api, at(TUE, 10), phone="+77005550011")
    assert created.status_code == 201
    token = created.json()["manage_token"]
    api.post(f"{V1}/bookings/cancel", json={"token": token})

    events = outbox(seeded)
    assert [e.event_type for e in events] == ["booking.created", "booking.status"]
    raw = json.dumps([e.payload for e in events], ensure_ascii=False)
    for secret in ("+77005550011", "Айдос", token):  # phone, customer name, manage link
        assert secret not in raw
    message = render("booking.created", events[0].payload)
    assert "Новая запись AP-" in message and "24.11.2026 10:00" in message
    assert "/admin/bookings/" in message
    assert "отменена (клиентом)" in render("booking.status", events[1].payload)


def test_staff_actions_queue_notifications(api, auth, clock, seeded) -> None:
    ref = book(api, at(TUE, 10)).json()["booking"]["reference"]
    bid = seeded.scalar(text("SELECT id FROM bookings WHERE reference = :r"), {"r": ref})
    h = auth["manager"]
    api.post(f"{ADMIN}/bookings/{bid}/status", json={"status": "confirmed"}, headers=h)
    api.post(
        f"{ADMIN}/bookings/{bid}/reschedule",
        json={"starts_at": at(TUE + timedelta(days=1), 9).isoformat()},
        headers=h,
    )
    kinds = [(e.event_type, e.payload.get("status")) for e in outbox(seeded)]
    assert kinds == [
        ("booking.created", None),
        ("booking.status", "confirmed"),
        ("booking.rescheduled", None),
    ]
    assert "24.11.2026 10:00 → 25.11.2026 09:00" in render(
        "booking.rescheduled", outbox(seeded)[-1].payload
    )


# --- delivery: retries, backoff, dead letters ----------------------------------------------


def queue(session, n=1) -> list[Notification]:
    rows = [Notification(event_type="test", payload={}, next_attempt_at=NOW) for _ in range(n)]
    session.add_all(rows)
    session.flush()
    return rows


def test_successful_delivery_marks_sent(seeded) -> None:
    [row] = queue(seeded)
    sent = []
    assert process_batch(seeded, NOW, sender=lambda t: sent.append(t) or SendResult(ok=True)) == 1
    assert row.status == "sent" and row.sent_at == NOW
    assert sent == ["Тестовое уведомление AutoPoint: интеграция с Telegram работает."]


def test_temporary_failure_backs_off_then_succeeds(seeded) -> None:
    [row] = queue(seeded)
    process_batch(seeded, NOW, sender=lambda t: SendResult(ok=False, error="HTTP 502"))
    assert (row.status, row.attempts, row.last_error) == ("pending", 1, "HTTP 502")
    assert timedelta(seconds=24) <= row.next_attempt_at - NOW <= timedelta(seconds=36)
    # Not due yet: nothing is sent.
    assert (
        process_batch(seeded, NOW + timedelta(seconds=5), sender=lambda t: SendResult(ok=True)) == 0
    )
    process_batch(seeded, NOW + timedelta(minutes=2), sender=lambda t: SendResult(ok=True))
    assert row.status == "sent"


def test_rate_limit_retry_after_is_honoured(seeded) -> None:
    [row] = queue(seeded)
    process_batch(
        seeded,
        NOW,
        sender=lambda t: SendResult(ok=False, error="Too Many Requests", retry_after=42),
    )
    assert row.next_attempt_at == NOW + timedelta(seconds=43)


def test_permanent_error_dead_letters_at_once(seeded) -> None:
    [row] = queue(seeded)
    process_batch(
        seeded, NOW, sender=lambda t: SendResult(ok=False, retryable=False, error="chat not found")
    )
    assert (row.status, row.attempts) == ("dead", 1)


def test_gives_up_after_max_attempts(seeded) -> None:
    [row] = queue(seeded)
    moment = NOW
    for _ in range(MAX_ATTEMPTS):
        process_batch(seeded, moment, sender=lambda t: SendResult(ok=False, error="timeout"))
        moment = row.next_attempt_at
    assert (row.status, row.attempts) == ("dead", MAX_ATTEMPTS)


def test_two_workers_never_take_the_same_rows() -> None:
    from app.db import SessionLocal, engine
    from tests.conftest import assert_test_database

    assert_test_database(engine)
    with SessionLocal() as setup:
        setup.execute(text("TRUNCATE notification_outbox"))
        setup.add_all(
            Notification(event_type="test", payload={}, next_attempt_at=NOW) for _ in range(3)
        )
        setup.commit()
    try:
        with SessionLocal() as first, SessionLocal() as second:
            claimed = first.scalars(
                select(Notification).with_for_update(skip_locked=True)  # worker 1 holds the rows
            ).all()
            assert len(claimed) == 3
            assert process_batch(second, NOW, sender=lambda t: SendResult(ok=True)) == 0
            first.rollback()
    finally:
        with SessionLocal() as cleanup:
            cleanup.execute(text("TRUNCATE notification_outbox"))
            cleanup.commit()


# --- Telegram HTTP layer ---------------------------------------------------------------------


class FakeHTTPError(urllib.error.HTTPError):
    def __init__(self, code: int, body: dict):
        super().__init__("https://api.telegram.org/bot<redacted>/sendMessage", code, "x", {}, None)
        self._body = json.dumps(body).encode()

    def read(self, *_):
        return self._body


@pytest.fixture
def telegram_env(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "123:SECRET-TOKEN")
    monkeypatch.setattr(settings, "telegram_chat_id", "-1001")
    calls = []

    def respond_with(outcome):
        def fake_urlopen(request, timeout):
            calls.append((request.full_url, json.loads(request.data), timeout))
            if isinstance(outcome, Exception):
                raise outcome
            return io.BytesIO(b'{"ok":true}')

        monkeypatch.setattr(telegram.urllib.request, "urlopen", fake_urlopen)

    return respond_with, calls


def test_telegram_request_and_error_mapping(telegram_env) -> None:
    respond_with, calls = telegram_env
    assert telegram.is_configured()
    respond_with(None)
    assert telegram.send_telegram("hello").ok
    url, body, timeout = calls[0]
    assert url.endswith("/bot123:SECRET-TOKEN/sendMessage") and timeout == 10
    assert body == {"chat_id": "-1001", "text": "hello", "disable_web_page_preview": True}

    respond_with(
        FakeHTTPError(429, {"description": "Too Many Requests", "parameters": {"retry_after": 7}})
    )
    assert telegram.send_telegram("x") == SendResult(
        ok=False, error="Too Many Requests", retry_after=7
    )
    respond_with(FakeHTTPError(400, {"description": "Bad Request: chat not found"}))
    assert telegram.send_telegram("x").retryable is False
    respond_with(FakeHTTPError(502, {}))
    assert telegram.send_telegram("x").retryable is True
    respond_with(urllib.error.URLError("dns"))
    result = telegram.send_telegram("x")
    assert result.retryable and "SECRET" not in (result.error or "")


def test_not_configured_means_nothing_is_sent() -> None:
    assert telegram.is_configured() is False  # no token in the test environment


# --- notifications admin -----------------------------------------------------------------------


def test_notifications_admin(api, auth, seeded) -> None:
    h = auth["admin"]
    summary = api.post(f"{ADMIN}/notifications/test", headers=h).json()
    assert summary == {"configured": False, "pending": 1, "dead": 0, "sent_24h": 0}
    row = outbox(seeded, "test")[0]
    assert api.post(f"{ADMIN}/notifications/{row.id}/retry", headers=h).status_code == 409
    row.status, row.attempts = "dead", MAX_ATTEMPTS
    seeded.flush()
    assert api.post(f"{ADMIN}/notifications/{row.id}/retry", headers=h).status_code == 204
    assert row.status == "pending" and row.attempts == 0
    listed = api.get(f"{ADMIN}/notifications", headers=h).json()
    assert listed["items"][0]["text"].startswith("Тестовое уведомление")
    assert api.get(f"{ADMIN}/notifications/summary", headers=auth["manager"]).status_code == 403


# --- contact form ------------------------------------------------------------------------------


def form(**extra) -> dict:
    issued = int(time.time()) - 10  # opened 10 seconds ago
    return {
        "name": "Мадина",
        "phone": "8 701 777 66 55",
        "message": "Сколько стоит керамика на Camry?",
        "consent": True,
        "token": f"{issued}.{_sign(issued)}",
        **extra,
    }


def test_contact_message_is_stored_and_staff_notified(api, auth, seeded) -> None:
    res = api.post(f"{V1}/contact", json=form())
    assert res.status_code == 202
    message = seeded.scalars(select(ContactMessage)).one()
    assert message.phone == "+77017776655" and message.status == "new"
    [event] = outbox(seeded, "contact.new")
    assert event.payload == {}  # nothing personal leaves the database

    listed = api.get(f"{ADMIN}/contact-messages", headers=auth["manager"]).json()
    assert listed["items"][0]["message"].startswith("Сколько")
    patched = api.patch(
        f"{ADMIN}/contact-messages/{message.id}",
        json={"status": "handled"},
        headers=auth["manager"],
    )
    assert patched.json()["status"] == "handled" and patched.json()["handled_at"]
    assert api.get(f"{ADMIN}/contact-messages", headers=auth["employee"]).status_code == 403


def test_contact_form_token_check(api) -> None:
    token = api.get(f"{V1}/contact/token").json()["token"]
    too_fast = api.post(f"{V1}/contact", json=form(token=token))
    assert too_fast.status_code == 422 and too_fast.json()["code"] == "TOO_FAST"
    forged = api.post(f"{V1}/contact", json=form(token=f"{int(time.time()) - 10}.deadbeef"))
    assert forged.json()["code"] == "FORM_EXPIRED"
    old = int(time.time()) - 3 * 3600
    assert (
        api.post(f"{V1}/contact", json=form(token=f"{old}.{_sign(old)}")).json()["code"]
        == "FORM_EXPIRED"
    )


@pytest.mark.parametrize(
    ("extra", "field"),
    [
        ({"website": "http://spam"}, None),
        ({"consent": False}, "consent"),
        ({"phone": "12"}, "phone"),
        ({"message": "hi"}, "message"),
    ],
)
def test_contact_form_rejects_bots_and_bad_input(api, extra, field) -> None:
    res = api.post(f"{V1}/contact", json=form(**extra))
    assert res.status_code == 422
    if field:
        assert field in [e["field"] for e in res.json()["errors"]]


def test_contact_form_is_rate_limited(api) -> None:
    for _ in range(5):
        assert api.post(f"{V1}/contact", json=form()).status_code == 202
    assert api.post(f"{V1}/contact", json=form()).status_code == 429


# --- image uploads -----------------------------------------------------------------------------


def image_bytes(fmt="PNG", size=(3000, 1500), exif=None) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (200, 160, 100)).save(out, fmt, **({"exif": exif} if exif else {}))
    return out.getvalue()


@pytest.fixture
def media_root(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    return tmp_path


def upload(api, headers, data: bytes, name="photo.jpg", mime="image/jpeg"):
    return api.post(f"{ADMIN}/media", headers=headers, files={"file": (name, data, mime)})


def test_upload_reencodes_to_webp_strips_exif_and_resizes(api, auth, media_root) -> None:
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"  # camera make; GPS would be stored the same way
    res = upload(api, auth["manager"], image_bytes("JPEG", exif=exif.tobytes()))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["width"] == 2400 and body["height"] == 1200
    name = body["url"].rsplit("/", 1)[1]
    assert len(name) == 37 and name.endswith(".webp")  # random name, not "photo.jpg"
    stored = media_root / name
    with Image.open(stored) as saved:
        assert saved.format == "WEBP"
        assert not saved.getexif()
    assert b"SecretCam" not in stored.read_bytes()


def test_uploaded_file_is_served_with_safe_headers(media_root, auth, api) -> None:
    from fastapi.testclient import TestClient

    from app.main import create_app

    url = upload(api, auth["admin"], image_bytes()).json()["url"]
    res = TestClient(create_app()).get(url)  # an app created after the media root changed
    assert res.status_code == 200 and res.headers["content-type"] == "image/webp"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "immutable" in res.headers["cache-control"]


@pytest.mark.parametrize(
    ("data", "status", "code"),
    [
        (b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>", 415, "UNSUPPORTED_IMAGE"),
        (b"#!/bin/sh\necho pwned\n", 415, "UNSUPPORTED_IMAGE"),  # a script named photo.jpg
        (image_bytes("GIF", size=(10, 10)), 415, "UNSUPPORTED_IMAGE"),
        (image_bytes("PNG", size=(8000, 8000)), 413, "IMAGE_TOO_LARGE"),  # 64 MP, tiny file
        (b"\xff" * (10 * 1024 * 1024 + 1), 413, "FILE_TOO_LARGE"),
    ],
)
def test_upload_rejects_dangerous_files(api, auth, media_root, data, status, code) -> None:
    res = upload(api, auth["admin"], data)
    assert res.status_code == status and res.json()["code"] == code
    assert list(media_root.iterdir()) == []  # nothing written


def test_employees_cannot_upload(api, auth, media_root) -> None:
    assert upload(api, auth["employee"], image_bytes()).status_code == 403


# --- gallery & reviews -------------------------------------------------------------------------


def test_real_gallery_pair_and_reviews(api, auth, media_root, seeded) -> None:
    h = auth["manager"]
    after = upload(api, h, image_bytes()).json()["url"]
    before = upload(api, h, image_bytes()).json()["url"]
    item = {
        "kind": "before_after",
        "image_url": after,
        "before_image_url": before,
        "alt_i18n": {"ru": "Капот до и после полировки"},
    }
    created = api.post(f"{ADMIN}/gallery", json=item, headers=h)
    assert created.status_code == 201 and created.json()["is_demo"] is False
    public = api.get(f"{V1}/gallery", params={"kind": "before_after"}).json()
    assert any(g["image_url"] == after and not g["is_demo"] for g in public)

    for bad in (
        "http://evil.example/x.jpg",
        "/api/v1/media/../../etc/passwd",
        "javascript:alert(1)",
    ):
        assert (
            api.post(f"{ADMIN}/gallery", json={**item, "image_url": bad}, headers=h).status_code
            == 422
        )
    assert (
        api.post(f"{ADMIN}/gallery", json={**item, "before_image_url": None}, headers=h).status_code
        == 422
    )

    demo = next(g for g in api.get(f"{ADMIN}/gallery", headers=h).json() if g["is_demo"])
    replaced = api.put(
        f"{ADMIN}/gallery/{demo['id']}",
        headers=h,
        json={**item, "kind": demo["kind"], "alt_i18n": demo["alt_i18n"]},
    )
    assert replaced.json()["is_demo"] is False  # a real photo makes it a real item

    review = api.post(
        f"{ADMIN}/reviews",
        headers=h,
        json={
            "author_name": "Тимур",
            "rating": 5,
            "body": "Отличная полировка, всё объяснили.",
            "review_date": "2026-11-10",
            "source": "2gis",
            "source_url": "https://2gis.kz/astana/review/1",
        },
    )
    assert review.status_code == 201
    reviews = api.get(f"{V1}/reviews").json()
    assert any(r["author_name"] == "Тимур" and not r["is_demo"] for r in reviews)
    demo_review = next(r for r in api.get(f"{ADMIN}/reviews", headers=h).json() if r["is_demo"])
    payload = {
        k: demo_review[k] for k in ("author_name", "body", "review_date", "locale", "source")
    }
    assert (
        api.put(f"{ADMIN}/reviews/{demo_review['id']}", headers=h, json=payload).json()["code"]
        == "DEMO_REVIEW"
    )
    assert api.delete(f"{ADMIN}/reviews/{demo_review['id']}", headers=h).status_code == 204
