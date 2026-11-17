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
