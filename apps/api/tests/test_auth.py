"""Login, tokens, refresh rotation, lockout, logout, users admin, and the route×role matrix."""

import re
import typing
import uuid
from datetime import timedelta

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.modules.auth.models import ROLES, RefreshSession, User
from app.modules.auth.permissions import ROLE_PERMISSIONS
from app.modules.auth.router import Role
from app.modules.auth.security import create_access_token, utcnow
from tests.conftest import PASSWORD, STAFF, login

AUTH = "/api/v1/auth"
SAME_SITE = {"X-Requested-With": "autopoint"}


def test_roles_agree_between_db_api_and_permissions() -> None:
    assert set(ROLES) == set(typing.get_args(Role)) == set(ROLE_PERMISSIONS)


def test_passwords_are_stored_as_argon2id(staff) -> None:
    assert staff["owner"].password_hash.startswith("$argon2id$")


def test_login_returns_token_and_a_locked_down_refresh_cookie(api, staff) -> None:
    res = login(api, STAFF["manager"])
    assert res.status_code == 200
    assert res.json()["token_type"] == "bearer" and res.json()["expires_in"] == 900
    cookie = res.headers["set-cookie"]
    assert cookie.startswith("ap_refresh=")
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api/v1/auth" in cookie

    me = api.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "manager"
    assert "catalog.write" not in me.json()["permissions"]


def test_wrong_password_and_unknown_email_look_the_same(api, staff) -> None:
    wrong = login(api, STAFF["owner"], "nope-nope-nope")
    unknown = login(api, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["code"] == unknown.json()["code"] == "INVALID_CREDENTIALS"


def test_lockout_after_five_failures_and_admin_unlock(api, staff, seeded) -> None:
    admin = {"Authorization": f"Bearer {login(api, STAFF['admin']).json()['access_token']}"}
    for _ in range(5):
        login(api, STAFF["manager"], "wrong-password-123")
    assert seeded.get(User, staff["manager"].id).locked_until is not None
    assert login(api, STAFF["manager"]).status_code == 401  # even the right password

    res = api.patch(
        f"/api/v1/admin/users/{staff['manager'].id}", json={"unlock": True}, headers=admin
    )
    assert res.status_code == 200
    assert login(api, STAFF["manager"]).status_code == 200


def test_cli_set_password_unlocks_and_signs_out(api, staff, seeded) -> None:
    """Render's free plan has no shell: the start script resets the owner with this."""
    from app.manage import set_password

    refresh = login(api, STAFF["manager"])
    assert refresh.status_code == 200
    for _ in range(5):
        login(api, STAFF["manager"], "wrong-password-123")
    assert seeded.get(User, staff["manager"].id).locked_until is not None

    set_password(seeded, STAFF["manager"], "brand-new-password-1")

    assert login(api, STAFF["manager"]).status_code == 401  # old password gone
    assert login(api, STAFF["manager"], "brand-new-password-1").status_code == 200
    sessions = seeded.scalars(
        select(RefreshSession).where(RefreshSession.revoke_reason == "password_reset")
    ).all()
    assert sessions and all(s.user_id == staff["manager"].id for s in sessions)


def test_refresh_rotates_and_reuse_kills_the_login(api, staff) -> None:
    login(api, STAFF["owner"])
    stolen = api.cookies.get("ap_refresh")

    assert api.post(f"{AUTH}/refresh").status_code == 403  # missing same-site header
    rotated = api.post(f"{AUTH}/refresh", headers=SAME_SITE)
    assert rotated.status_code == 200
    assert api.cookies.get("ap_refresh") != stolen
    new_access = {"Authorization": f"Bearer {rotated.json()['access_token']}"}
    assert api.get(f"{AUTH}/me", headers=new_access).status_code == 200

    # The old token shows up again (e.g. stolen): the whole login family is revoked.
    api.cookies.clear()
    reuse = api.post(f"{AUTH}/refresh", headers=SAME_SITE | {"Cookie": f"ap_refresh={stolen}"})
    assert reuse.status_code == 401 and reuse.json()["code"] == "REFRESH_REUSED"
    assert api.get(f"{AUTH}/me", headers=new_access).status_code == 401


def test_logout_invalidates_access_token_immediately(api, staff) -> None:
    token = login(api, STAFF["admin"]).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert api.get(f"{AUTH}/me", headers=headers).status_code == 200
    assert api.post(f"{AUTH}/logout", headers=SAME_SITE).status_code == 204
    assert api.get(f"{AUTH}/me", headers=headers).status_code == 401
    assert api.post(f"{AUTH}/refresh", headers=SAME_SITE).status_code == 401


@pytest.mark.parametrize(
    "header",
    [
        "Bearer not-a-jwt",
        "Basic dXNlcjpwYXNz",
        "",
    ],
)
def test_garbage_tokens_are_rejected(api, header) -> None:
    res = api.get(f"{AUTH}/me", headers={"Authorization": header})
    assert res.status_code == 401
    assert res.headers["WWW-Authenticate"] == "Bearer"


def test_expired_and_forged_tokens_are_rejected(api, staff, seeded) -> None:
    login(api, STAFF["owner"])
    owner = staff["owner"]
    family = seeded.scalar(
        select(RefreshSession.family_id).where(RefreshSession.user_id == owner.id)
    )  # a live login: only the token itself is wrong below
    expired = create_access_token(owner.id, family, utcnow() - timedelta(hours=1))
    assert api.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401

    import jwt

    forged = jwt.encode(
        {"sub": str(owner.id), "sid": str(family), "typ": "access", "iat": 0, "exp": 9_999_999_999},
        "a-guessed-secret-that-is-long-enough-0123",
        algorithm="HS256",
    )
    assert api.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    unsigned = jwt.encode(
        {"sub": str(owner.id), "sid": str(family), "typ": "access", "iat": 0, "exp": 9_999_999_999},
        key=None,
        algorithm="none",
    )
    assert api.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_deactivating_a_user_cuts_access_at_once(api, auth, staff) -> None:
    res = api.patch(
        f"/api/v1/admin/users/{staff['manager'].id}",
        json={"is_active": False},
        headers=auth["owner"],
    )
    assert res.status_code == 200
    assert api.get(f"{AUTH}/me", headers=auth["manager"]).status_code == 401
    assert login(api, STAFF["manager"]).status_code == 401


def test_password_change(api, auth) -> None:
    bad = api.post(
        f"{AUTH}/password",
        headers=auth["manager"],
        json={"current_password": "wrong", "new_password": "a-brand-new-password"},
    )
    assert bad.status_code == 422 and bad.json()["code"] == "WRONG_PASSWORD"
    short = api.post(
        f"{AUTH}/password",
        headers=auth["manager"],
        json={"current_password": PASSWORD, "new_password": "short"},
    )
    assert short.status_code == 422
    ok = api.post(
        f"{AUTH}/password",
        headers=auth["manager"],
        json={"current_password": PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert ok.status_code == 204
    assert api.get(f"{AUTH}/me", headers=auth["manager"]).status_code == 200  # this device stays
    assert login(api, STAFF["manager"]).status_code == 401
    assert login(api, STAFF["manager"], "a-brand-new-password").status_code == 200


def test_owner_accounts_are_protected(api, auth, staff) -> None:
    owner_id = staff["owner"].id
    new_owner = {
        "email": "x@example.com",
        "full_name": "X Y",
        "role": "owner",
        "password": "p" * 12,
    }
    assert (
        api.post("/api/v1/admin/users", json=new_owner, headers=auth["admin"]).json()["code"]
        == "OWNER_ONLY"
    )
    assert (
        api.patch(
            f"/api/v1/admin/users/{owner_id}", json={"role": "manager"}, headers=auth["admin"]
        ).status_code
        == 403
    )
    last = api.patch(
        f"/api/v1/admin/users/{owner_id}", json={"role": "admin"}, headers=auth["owner"]
    )
    assert last.status_code == 409 and last.json()["code"] == "LAST_OWNER"

    created = api.post("/api/v1/admin/users", headers=auth["owner"], json=new_owner)
    assert created.status_code == 201
    assert "password" not in created.text and "argon2" not in created.text


def _permission(route: APIRoute):
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if hasattr(dep.call, "permission"):
            return dep.call.permission
        stack.extend(dep.dependencies)
    return None


def test_every_admin_route_requires_a_permission_and_enforces_it(api, auth) -> None:
    # FastAPI keeps included routers lazily; walk their original routes (mounted at /api/v1).
    routes = [
        (route, "/api/v1" + route.path)
        for included in api.app.routes
        if hasattr(included, "original_router")
        for route in included.original_router.routes
        if isinstance(route, APIRoute) and route.path.startswith("/admin")
    ]
    assert len(routes) >= 30
    checked = 0
    for route, full_path in routes:
        permission = _permission(route)
        assert permission is not None, f"{full_path} has no permission dependency"
        path = re.sub(
            r"\{[^}]+\}",
            lambda m: (
                str(uuid.uuid4())
                if "_id" in m.group()
                and ("user" in m.group() or "booking" in m.group() or "customer" in m.group())
                else "999999"
            ),
            full_path,
        )
        for method in route.methods:
            anonymous = api.request(method, path, json={})
            assert anonymous.status_code == 401, (method, path)
            for role, headers in auth.items():
                res = api.request(
                    method, path, json={}, headers=headers | {"Idempotency-Key": str(uuid.uuid4())}
                )
                allowed = permission in ROLE_PERMISSIONS[role]
                assert (res.status_code == 403) != allowed, (
                    role,
                    method,
                    path,
                    res.status_code,
                    res.text,
                )
                checked += 1
    assert checked >= 120
