"""Tests run against a separate `<db>_test` database on the same PostgreSQL server.

Must run before anything imports `app.db` (which creates the engine from DATABASE_URL).
"""

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import Settings

API_DIR = Path(__file__).resolve().parents[1]

_base_url = make_url(Settings().database_url)
_test_url = _base_url.set(database=f"{_base_url.database}_test")
os.environ["DATABASE_URL"] = _test_url.render_as_string(hide_password=False)


def _ensure_test_database() -> None:
    admin = create_engine(_base_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": _test_url.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{_test_url.database}"'))
    admin.dispose()


def assert_test_database(engine) -> None:
    """Destructive fixtures must never touch a non-test database (e.g. if the app was
    imported before this conftest redirected DATABASE_URL)."""
    if not (engine.url.database or "").endswith("_test"):
        raise RuntimeError(f"Refusing to modify non-test database {engine.url.database!r}")


def run_alembic(*args: str) -> None:
    subprocess.run(  # noqa: S603 - fixed argv, no shell
        [sys.executable, "-m", "alembic", *args], cwd=API_DIR, check=True
    )


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    _ensure_test_database()
    run_alembic("upgrade", "head")


@pytest.fixture
def db_session() -> Iterator:
    """A session inside one outer transaction that is rolled back after the test."""
    from sqlalchemy.orm import Session

    from app import models  # noqa: F401
    from app.db import Base, engine

    assert_test_database(engine)
    with engine.connect() as conn:
        trans = conn.begin()
        session = Session(bind=conn, join_transaction_mode="create_savepoint")
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        try:
            yield session
        finally:
            session.close()
            trans.rollback()


@pytest.fixture
def seeded(db_session):
    from app.seed import seed

    assert seed(db_session)
    db_session.flush()
    return db_session


@pytest.fixture
def api(seeded):
    from fastapi.testclient import TestClient

    from app.db import get_session
    from app.main import create_app
    from app.ratelimit import HIT_SQL, get_hit_counter

    app = create_app()
    app.dependency_overrides[get_session] = lambda: seeded
    # Count hits inside the test transaction (a separate connection would block on its locks).
    app.dependency_overrides[get_hit_counter] = lambda: (
        lambda key, window: seeded.execute(HIT_SQL, {"k": key, "w": window}).scalar_one()
    )
    return TestClient(app)
