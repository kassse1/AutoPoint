"""Many customers grab the same last slot at the same moment (real threads, real commits).

Unlike the other API tests this one can't run inside a rolled-back transaction: each
request needs its own connection and its own commit, exactly as in production.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
from threading import Barrier
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app import models  # noqa: F401
from app.db import Base, SessionLocal, engine
from app.main import create_app
from app.modules.bookings.models import ACTIVE_STATUSES, Booking
from app.seed import seed
from tests.conftest import assert_test_database

TZ = ZoneInfo("Asia/Almaty")
REQUESTS = 20


@pytest.fixture
def committed_seed():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)

    assert_test_database(engine)

    def reset():
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))

    reset()
    with SessionLocal.begin() as session:
        seed(session)
    yield
    reset()


def test_only_one_of_many_simultaneous_requests_gets_the_slot(committed_seed, monkeypatch):
    monkeypatch.setattr(
        "app.modules.bookings.public.utcnow",
        lambda: datetime.combine(date(2026, 11, 23), time(9), TZ),
    )
    app = create_app()
    start = datetime.combine(date(2026, 11, 24), time(10), TZ)  # PPF: only Дмитрий can do it
    barrier = Barrier(REQUESTS)

    def attempt(i: int):
        # A distinct client address per request so the per-IP rate limit doesn't interfere.
        client = TestClient(app, client=(f"10.0.0.{i + 1}", 50000))
        barrier.wait()  # release all requests at once
        return client.post(
            "/api/v1/public/bookings",
            json={
                "selection": {"service": "ppf", "vehicle": "sedan"},
                "starts_at": start.isoformat(),
                "customer": {"name": f"Клиент {i}", "phone": f"+7701000{i:04d}"},
                "consent": True,
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    with ThreadPoolExecutor(REQUESTS) as pool:
        responses = list(pool.map(attempt, range(REQUESTS)))

    codes = sorted(r.status_code for r in responses)
    assert codes.count(201) == 1, codes
    assert codes.count(409) == REQUESTS - 1, codes
    assert {r.json()["code"] for r in responses if r.status_code == 409} == {"SLOT_UNAVAILABLE"}

    with SessionLocal() as session:
        active = session.scalar(
            select(func.count()).select_from(Booking).where(Booking.status.in_(ACTIVE_STATUSES))
        )
    assert active == 1
