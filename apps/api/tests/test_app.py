"""Foundation tests (real PostgreSQL test database, see conftest.py)."""

import json
import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.logs import JsonFormatter
from app.main import create_app
from tests.conftest import run_alembic


@pytest.fixture
def client() -> TestClient:
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    @app.get("/items/{item_id}")
    def item(item_id: int) -> dict[str, int]:
        return {"id": item_id}

    return TestClient(app, raise_server_exceptions=False)


def test_liveness(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_readiness_checks_real_database(client: TestClient) -> None:
    res = client.get("/health/ready")
    assert res.status_code == 200, res.text
    assert res.json() == {"status": "ok", "database": "ok"}


def test_readiness_reports_503_when_database_is_down(client: TestClient) -> None:
    broken = create_engine(
        "postgresql+psycopg://x:x@127.0.0.1:1/x", connect_args={"connect_timeout": 1}
    )

    def broken_session():
        with Session(broken) as session:
            yield session

    client.app.dependency_overrides[get_session] = broken_session
    res = client.get("/health/ready")
    assert res.status_code == 503
    assert res.json()["code"] == "DATABASE_UNAVAILABLE"


def test_not_found_uses_problem_format(client: TestClient) -> None:
    res = client.get("/nope", headers={"X-Request-ID": "abc-123"})
    assert res.status_code == 404
    assert res.headers["content-type"] == "application/problem+json"
    body = res.json()
    assert body["code"] == "NOT_FOUND"
    assert body["status"] == 404
    assert body["request_id"] == "abc-123"
    assert res.headers["X-Request-ID"] == "abc-123"


def test_validation_error_lists_fields(client: TestClient) -> None:
    res = client.get("/items/not-a-number")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["errors"][0]["field"] == "item_id"
    assert body["errors"][0]["code"] == "int_parsing"


def test_unhandled_error_hides_details_and_keeps_request_id(client: TestClient) -> None:
    res = client.get("/boom")
    assert res.status_code == 500
    body = res.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "secret" not in res.text
    assert body["request_id"] == res.headers["X-Request-ID"]


def test_unsafe_request_id_is_replaced(client: TestClient) -> None:
    res = client.get("/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert res.headers["X-Request-ID"] != "bad id\nwith newline"
    assert len(res.headers["X-Request-ID"]) == 32


def test_json_log_drops_unknown_extra_fields() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "hello", None, None)
    record.path = "/health"
    record.password = "hunter2"  # must never reach the log line
    line = json.loads(JsonFormatter().format(record))
    assert line["msg"] == "hello"
    assert line["path"] == "/health"
    assert "password" not in line


def test_migrations_upgrade_and_downgrade() -> None:
    engine = create_engine(get_settings().database_url)

    def extensions() -> set[str]:
        with engine.connect() as conn:
            return set(conn.execute(text("SELECT extname FROM pg_extension")).scalars())

    try:
        run_alembic("downgrade", "base")
        assert not {"btree_gist", "citext"} & extensions()
        run_alembic("upgrade", "head")
        assert {"btree_gist", "citext"} <= extensions()
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "url",
    ["postgres://u:p@h:5432/d", "postgresql://u:p@h:5432/d", "postgresql+psycopg://u:p@h:5432/d"],
)
def test_database_url_uses_psycopg(url):
    from app.config import Settings

    assert Settings(database_url=url).database_url == "postgresql+psycopg://u:p@h:5432/d"


@pytest.mark.parametrize("module", ["app.seed", "app.manage", "app.worker"])
def test_cli_modules_resolve_all_foreign_keys(module):
    # A fresh interpreter, like `python -m app.seed` on a new install: every FK target
    # must be importable without app.main having loaded the other models first.
    import subprocess
    import sys

    code = (
        f"import {module}; from app.db import Base; "
        "[fk.column for t in Base.metadata.tables.values() for fk in t.foreign_keys]"
    )
    subprocess.run([sys.executable, "-c", code], check=True)  # noqa: S603 - fixed test input
