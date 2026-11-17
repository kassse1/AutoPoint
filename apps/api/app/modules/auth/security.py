"""Passwords (Argon2id), short-lived access JWTs and opaque refresh tokens."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import get_settings

ACCESS_TTL = timedelta(minutes=15)
REFRESH_IDLE_TTL = timedelta(days=14)  # unused this long → log in again
REFRESH_ABSOLUTE_TTL = timedelta(days=30)  # after this, log in again no matter what
REFRESH_COOKIE = "ap_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
MAX_FAILED_LOGINS = 5

_hasher = PasswordHasher()  # Argon2id with the library's current recommended parameters
# Verifying against this when the email is unknown keeps login timing the same either way.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: uuid.UUID, family_id: uuid.UUID, now: datetime) -> str:
    payload = {
        "sub": str(user_id),
        "sid": str(family_id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + ACCESS_TTL).timestamp()),
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=["HS256"],  # fixed list: no "none", no algorithm confusion
            options={"require": ["sub", "sid", "exp", "iat"]},
        )
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == "access" else None


def new_refresh_token() -> tuple[str, bytes]:
    token = secrets.token_urlsafe(32)
    return token, refresh_hash(token)


def refresh_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def lockout_until(failed_logins: int, now: datetime) -> datetime | None:
    """15 min after the 5th failure, doubling each further failure, capped at 24 h."""
    if failed_logins < MAX_FAILED_LOGINS:
        return None
    minutes = 15 * 2 ** (failed_logins - MAX_FAILED_LOGINS)
    return now + min(timedelta(minutes=minutes), timedelta(hours=24))


def utcnow() -> datetime:
    return datetime.now(UTC)
