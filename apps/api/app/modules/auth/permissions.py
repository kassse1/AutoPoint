"""Roles and permissions live in code: they are fixed and not editable by the business.

Every admin route declares exactly one permission with `Depends(require(Permission.X))`.
A test walks every registered admin route and checks it against every role.
"""

import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import exists, select

from app.deps import SessionDep
from app.errors import AppError
from app.modules.auth.models import RefreshSession, User
from app.modules.auth.security import decode_access_token, utcnow


class Permission(StrEnum):
    BOOKINGS_READ = "bookings.read"  # employees: only their own
    BOOKINGS_WRITE = "bookings.write"  # create, reschedule, assign, notes, status
    BOOKINGS_WORK = "bookings.work"  # start / finish a job (employees: own only)
    CUSTOMERS_READ = "customers.read"
    CUSTOMERS_WRITE = "customers.write"
    SCHEDULES_WRITE = "schedules.write"  # hours, exceptions, staff schedules
    CATALOG_WRITE = "catalog.write"  # services, options, prices, vehicle classes, discounts
    STAFF_READ = "staff.read"
    STAFF_WRITE = "staff.write"
    SETTINGS_WRITE = "settings.write"
    USERS_MANAGE = "users.manage"
    AUDIT_READ = "audit.read"


P = Permission
ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    "owner": frozenset(P),
    "admin": frozenset(P),  # owners are protected from admins inside the users endpoints
    "manager": frozenset(
        {
            P.BOOKINGS_READ,
            P.BOOKINGS_WRITE,
            P.BOOKINGS_WORK,
            P.CUSTOMERS_READ,
            P.CUSTOMERS_WRITE,
            P.SCHEDULES_WRITE,
            P.STAFF_READ,
        }
    ),
    "employee": frozenset({P.BOOKINGS_READ, P.BOOKINGS_WORK}),
}


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    role: str
    email: str
    family_id: uuid.UUID

    def can(self, permission: Permission) -> bool:
        return permission in ROLE_PERMISSIONS[self.role]


def get_current_user(request: Request, session: SessionDep) -> CurrentUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    claims = decode_access_token(token) if scheme.lower() == "bearer" else None
    if claims is None:
        raise AppError(401, "UNAUTHENTICATED", headers={"WWW-Authenticate": "Bearer"})
    user_id, family_id = uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])
    now = utcnow()
    # Role and active flag come from the database, and the login session must still be
    # alive: deactivating a user, changing a role or logging out takes effect immediately.
    session_alive = exists().where(
        RefreshSession.family_id == family_id,
        RefreshSession.user_id == user_id,
        RefreshSession.revoked_at.is_(None),
        RefreshSession.rotated_at.is_(None),
        RefreshSession.expires_at > now,
    )
    user = session.scalar(select(User).where(User.id == user_id, User.is_active, session_alive))
    if user is None:
        raise AppError(401, "UNAUTHENTICATED", headers={"WWW-Authenticate": "Bearer"})
    return CurrentUser(id=user.id, role=user.role, email=user.email, family_id=family_id)


AuthUser = Annotated[CurrentUser, Depends(get_current_user)]


def require(permission: Permission):
    def dependency(user: AuthUser) -> CurrentUser:
        if not user.can(permission):
            raise AppError(403, "FORBIDDEN", f"Requires {permission}")
        return user

    dependency.permission = permission  # read by the route×role test
    return dependency
