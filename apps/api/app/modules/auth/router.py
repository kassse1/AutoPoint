"""Staff login, token refresh with rotation, logout, own sessions and password; user admin."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import SessionDep
from app.errors import AppError
from app.modules.audit.models import apply_changes, record, record_user
from app.modules.auth.models import RefreshSession, User
from app.modules.auth.permissions import (
    ROLE_PERMISSIONS,
    AuthUser,
    CurrentUser,
    Permission,
    require,
)
from app.modules.auth.security import (
    ACCESS_TTL,
    REFRESH_ABSOLUTE_TTL,
    REFRESH_COOKIE,
    REFRESH_COOKIE_PATH,
    REFRESH_IDLE_TTL,
    create_access_token,
    hash_password,
    lockout_until,
    needs_rehash,
    new_refresh_token,
    refresh_hash,
    utcnow,
    verify_password,
)
from app.ratelimit import rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/admin/users", tags=["admin: users"])

Password = Annotated[str, Field(min_length=10, max_length=128)]
Role = Literal["owner", "admin", "manager", "employee"]


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - not a secret
    expires_in: int


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    permissions: list[str]


class SessionOut(BaseModel):
    family_id: uuid.UUID
    started_at: datetime
    last_used_at: datetime
    user_agent: str | None
    ip: str | None
    current: bool


class PasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(max_length=128)
    new_password: Password


# --- helpers ----------------------------------------------------------------------------


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(REFRESH_ABSOLUTE_TTL.total_seconds()),
        path=REFRESH_COOKIE_PATH,  # sent only to the auth endpoints, never to anything else
        httponly=True,  # not readable from JavaScript
        samesite="strict",  # not sent on cross-site requests
        secure=get_settings().environment == "production",  # dev/test run on plain http
    )


def _require_same_site(request: Request) -> None:
    """Defence in depth for cookie-authenticated endpoints: a cross-site form can't add a
    custom header, and SameSite=Strict already keeps the cookie off cross-site requests."""
    if request.headers.get("x-requested-with") != "autopoint":
        raise AppError(403, "CSRF_CHECK_FAILED")


def _issue(
    session: Session,
    request: Request,
    response: Response,
    user_id: uuid.UUID,
    family_id: uuid.UUID,
    family_started_at: datetime,
    now: datetime,
) -> TokenOut:
    token, digest = new_refresh_token()
    session.add(
        RefreshSession(
            user_id=user_id,
            family_id=family_id,
            token_hash=digest,
            created_at=now,
            family_started_at=family_started_at,
            expires_at=min(now + REFRESH_IDLE_TTL, family_started_at + REFRESH_ABSOLUTE_TTL),
            user_agent=(request.headers.get("user-agent") or "")[:300] or None,
            ip=request.client.host if request.client else None,
        )
    )
    _set_refresh_cookie(response, token)
    return TokenOut(
        access_token=create_access_token(user_id, family_id, now),
        expires_in=int(ACCESS_TTL.total_seconds()),
    )


def revoke_sessions(
    session: Session, user_id: uuid.UUID, reason: str, family_id: uuid.UUID | None = None
) -> None:
    query = update(RefreshSession).where(
        RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None)
    )
    if family_id is not None:
        query = query.where(RefreshSession.family_id == family_id)
    session.execute(query.values(revoked_at=utcnow(), revoke_reason=reason))


# --- auth endpoints -----------------------------------------------------------------------


@router.post("/login", dependencies=[Depends(rate_limit("login", 10, 60))])
def login(body: LoginIn, request: Request, response: Response, session: SessionDep) -> TokenOut:
    now = utcnow()
    user = session.scalar(select(User).where(User.email == body.email.strip()))
    locked = user is not None and user.locked_until is not None and user.locked_until > now
    # Always run the hash check (even for unknown or locked users): equal timing for all cases.
    valid = verify_password(user.password_hash if user else None, body.password)
    if user is None or locked or not valid or not user.is_active:
        if user is not None and not locked and not valid:
            user.failed_logins += 1
            user.locked_until = lockout_until(user.failed_logins, now)
            if user.locked_until:
                record(
                    session,
                    action="auth.locked",
                    entity_type="user",
                    entity_id=user.id,
                    actor_kind="system",
                    after={"failed_logins": user.failed_logins},
                )
            session.commit()
        raise AppError(401, "INVALID_CREDENTIALS", "Wrong email or password")

    user.failed_logins, user.locked_until, user.last_login_at = 0, None, now
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    out = _issue(session, request, response, user.id, uuid.uuid4(), now, now)
    record_user(session, user, "auth.login", "user", user.id)
    session.commit()
    return out


@router.post("/refresh", dependencies=[Depends(rate_limit("refresh", 60, 60))])
def refresh(request: Request, response: Response, session: SessionDep) -> TokenOut:
    _require_same_site(request)
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise AppError(401, "UNAUTHENTICATED")
    now = utcnow()
    current = session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == refresh_hash(token))
    )
    if current is None or current.revoked_at is not None or current.expires_at <= now:
        raise AppError(401, "UNAUTHENTICATED")
    if current.rotated_at is not None:
        # An old token came back: someone copied it. End this login everywhere.
        revoke_sessions(session, current.user_id, "reuse_detected", current.family_id)
        record(
            session,
            action="auth.refresh_reuse",
            entity_type="user",
            entity_id=current.user_id,
            actor_kind="system",
        )
        session.commit()
        raise AppError(401, "REFRESH_REUSED")
    user = session.get(User, current.user_id)
    if user is None or not user.is_active:
        raise AppError(401, "UNAUTHENTICATED")
    current.rotated_at = now
    out = _issue(
        session, request, response, user.id, current.family_id, current.family_started_at, now
    )
    session.commit()
    return out


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, session: SessionDep) -> None:
    _require_same_site(request)
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        current = session.scalar(
            select(RefreshSession).where(RefreshSession.token_hash == refresh_hash(token))
        )
        if current is not None:
            revoke_sessions(session, current.user_id, "logout", current.family_id)
            session.commit()
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@router.post("/logout-all", status_code=204)
def logout_all(user: AuthUser, response: Response, session: SessionDep) -> None:
    revoke_sessions(session, user.id, "logout_all")
    record_user(session, user, "auth.logout_all", "user", user.id)
    session.commit()
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@router.get("/me")
def me(user: AuthUser, session: SessionDep) -> MeOut:
    row = session.get(User, user.id)
    return MeOut(
        id=row.id,
        email=row.email,
        full_name=row.full_name,
        role=row.role,
        permissions=sorted(ROLE_PERMISSIONS[row.role]),
    )


@router.post("/password", status_code=204)
def change_password(body: PasswordIn, user: AuthUser, session: SessionDep) -> None:
    row = session.get(User, user.id)
    if not verify_password(row.password_hash, body.current_password):
        raise AppError(422, "WRONG_PASSWORD")
    row.password_hash = hash_password(body.new_password)
    # Other devices must log in again; this one keeps working.
    session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.family_id != user.family_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow(), revoke_reason="password_changed")
    )
    record_user(session, user, "auth.password_changed", "user", user.id)
    session.commit()


@router.get("/sessions")
def my_sessions(user: AuthUser, session: SessionDep) -> list[SessionOut]:
    rows = session.execute(
        select(
            RefreshSession.family_id,
            func.min(RefreshSession.family_started_at),
            func.max(RefreshSession.created_at),
            func.max(RefreshSession.user_agent),
            func.max(RefreshSession.ip),
        )
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.rotated_at.is_(None),
            RefreshSession.expires_at > utcnow(),
        )
        .group_by(RefreshSession.family_id)
    ).all()
    return [
        SessionOut(
            family_id=f,
            started_at=s,
            last_used_at=u,
            user_agent=a,
            ip=i,
            current=f == user.family_id,
        )
        for f, s, u, a, i in rows
    ]


@router.delete("/sessions/{family_id}", status_code=204)
def revoke_my_session(family_id: uuid.UUID, user: AuthUser, session: SessionDep) -> None:
    revoke_sessions(session, user.id, "revoked_by_user", family_id)
    session.commit()


# --- user administration -----------------------------------------------------------------

UsersAdmin = Annotated[CurrentUser, Depends(require(Permission.USERS_MANAGE))]


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    locked: bool


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: str = Field(max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(min_length=2, max_length=100)
    role: Role
    password: Password


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    role: Role | None = None
    is_active: bool | None = None
    password: Password | None = None  # reset by an admin
    unlock: bool | None = None


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        locked=bool(u.locked_until and u.locked_until > utcnow()),
    )


def _guard_owner_rules(actor: CurrentUser, target_role: str, new_role: str | None) -> None:
    """Only owners create, change or demote owners."""
    if actor.role != "owner" and "owner" in (target_role, new_role):
        raise AppError(403, "OWNER_ONLY", "Only an owner can manage owner accounts")


@users_router.get("")
def list_users(actor: UsersAdmin, session: SessionDep) -> list[UserOut]:
    return [_user_out(u) for u in session.scalars(select(User).order_by(User.created_at))]


@users_router.post("", status_code=201)
def create_user(body: UserCreate, actor: UsersAdmin, session: SessionDep) -> UserOut:
    _guard_owner_rules(actor, body.role, None)
    if session.scalar(select(User.id).where(User.email == body.email)):
        raise AppError(409, "EMAIL_TAKEN")
    user = User(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    session.flush()
    record_user(
        session,
        actor,
        "user.created",
        "user",
        user.id,
        after={"email": user.email, "role": user.role},
    )
    session.commit()
    return _user_out(user)


@users_router.patch("/{user_id}")
def update_user(
    user_id: uuid.UUID, body: UserUpdate, actor: UsersAdmin, session: SessionDep
) -> UserOut:
    user = session.get(User, user_id)
    if user is None:
        raise AppError(404, "USER_NOT_FOUND")
    _guard_owner_rules(actor, user.role, body.role)
    data = body.model_dump(exclude_unset=True, exclude={"password", "unlock"})
    stays_owner = data.get("role", user.role) == "owner" and data.get("is_active", user.is_active)
    if user.role == "owner" and user.is_active and not stays_owner:
        # Checked before anything changes: the studio must never lose its last owner.
        others = session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == "owner", User.is_active, User.id != user.id)
        )
        if others == 0:
            raise AppError(409, "LAST_OWNER", "At least one active owner must remain")
    before, after = apply_changes(user, data)
    if body.password:
        user.password_hash = hash_password(body.password)
        after["password"] = "reset"  # noqa: S105 - marker; the value itself is never logged
    if body.unlock:
        user.failed_logins, user.locked_until = 0, None
        after["unlocked"] = True
    if {"role", "is_active"} & after.keys() or "password" in after:
        revoke_sessions(session, user.id, "changed_by_admin")
    if after:
        record_user(session, actor, "user.updated", "user", user.id, before=before, after=after)
    session.commit()
    return _user_out(user)


@users_router.post("/{user_id}/revoke-sessions", status_code=204)
def revoke_user_sessions(user_id: uuid.UUID, actor: UsersAdmin, session: SessionDep) -> None:
    user = session.get(User, user_id)
    if user is None:
        raise AppError(404, "USER_NOT_FOUND")
    _guard_owner_rules(actor, user.role, None)
    revoke_sessions(session, user.id, "revoked_by_admin")
    record_user(session, actor, "user.sessions_revoked", "user", user.id)
    session.commit()
