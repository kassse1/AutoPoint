"""Threat model §8: body limits (T15), statement timeout (T15), hidden SQL parameters (T13)."""

from sqlalchemy import text

from app.db import engine


def test_json_body_over_limit_is_refused_before_reading(api) -> None:
    response = api.post(
        "/api/v1/public/contact",
        content=b"{}",
        headers={"content-type": "application/json", "content-length": str(1024 * 1024 + 1)},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TOO_LARGE"


def test_chunked_body_is_refused(api) -> None:
    response = api.post(
        "/api/v1/public/contact",
        content=iter([b"{}"]),  # a generator body is sent chunked
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 411


def test_upload_route_allows_file_sized_bodies(api, auth) -> None:
    # 5 MB is over the JSON limit but within the upload limit: reaches the upload handler.
    response = api.post(
        "/api/v1/admin/media",
        headers=auth["owner"],
        files={"file": ("x.jpg", b"\xff" * (5 * 1024 * 1024), "image/jpeg")},
    )
    assert response.status_code == 415  # not an image, but not refused for its size


def test_database_statement_timeout_and_hidden_parameters() -> None:
    with engine.connect() as connection:
        assert connection.execute(text("SHOW statement_timeout")).scalar() == "10s"
    assert engine.hide_parameters


def test_app_role_cannot_change_or_delete_audit_rows() -> None:
    """T16: the restricted role the production app uses can add audit rows, never alter them."""
    import pytest
    from sqlalchemy.exc import ProgrammingError

    from app.manage import grant_app_role

    role = "autopoint_app_test"
    with engine.begin() as connection:
        connection.execute(text(f"DROP ROLE IF EXISTS {role}"))
        connection.execute(text(f"CREATE ROLE {role} NOLOGIN"))
    try:
        with engine.begin() as connection:
            assert grant_app_role(connection, role)
            assert grant_app_role(connection, role)  # idempotent

        def as_app(sql: str) -> None:
            with engine.begin() as connection:
                connection.execute(text(f"SET LOCAL ROLE {role}"))
                connection.execute(text(sql))

        as_app(
            "INSERT INTO audit_logs (action, entity_type, entity_id, actor_kind)"
            " VALUES ('test', 'test', '1', 'system')"
        )
        as_app("SELECT count(*) FROM bookings")
        as_app("UPDATE rate_limit_counters SET count = count")
        for sql in ("UPDATE audit_logs SET action = 'x'", "DELETE FROM audit_logs"):
            with pytest.raises(ProgrammingError, match="permission denied"):
                as_app(sql)
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM audit_logs WHERE action = 'test'"))
            connection.execute(text(f"DROP OWNED BY {role}"))
            connection.execute(text(f"DROP ROLE {role}"))


def test_grant_app_role_skips_missing_role() -> None:
    from app.manage import grant_app_role

    with engine.begin() as connection:
        assert grant_app_role(connection, "no_such_role_here") is False
