"""Website contact form. Spam protection: a honeypot field, a signed "form opened at" token
(too fast or too old is rejected) and a per-IP rate limit. No CAPTCHA, so no third party."""

import hashlib
import hmac
import re
import time
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import get_settings
from app.deps import SessionDep
from app.errors import AppError
from app.i18n import DEFAULT_LOCALE, Locale
from app.modules.contact.models import ContactMessage
from app.modules.customers.models import normalize_phone
from app.modules.notifications.models import notify
from app.ratelimit import rate_limit

router = APIRouter(prefix="/public/contact", tags=["contact"])

MIN_FILL_SECONDS = 3  # humans need longer than this to fill the form
MAX_FORM_AGE_SECONDS = 2 * 3600


def _sign(issued: int) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, f"contact:{issued}".encode(), hashlib.sha256).hexdigest()[:32]


def check_form_token(token: str, now: float) -> None:
    issued_text, _, signature = token.partition(".")
    if not issued_text.isdigit() or not hmac.compare_digest(signature, _sign(int(issued_text))):
        raise AppError(422, "FORM_EXPIRED", "Reload the page and try again")
    age = now - int(issued_text)
    if age > MAX_FORM_AGE_SECONDS:
        raise AppError(422, "FORM_EXPIRED", "Reload the page and try again")
    if age < MIN_FILL_SECONDS:
        raise AppError(422, "TOO_FAST", "Please try again")


class FormTokenOut(BaseModel):
    token: str


class ContactIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(max_length=30)
    email: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=10, max_length=2000)
    consent: Literal[True]
    locale: Locale = DEFAULT_LOCALE
    token: str = Field(max_length=100)
    website: str = Field(default="", max_length=200)  # honeypot

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        normalized = normalize_phone(value)
        if normalized is None:
            raise ValueError("invalid_phone")
        return normalized

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        if not value:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("invalid_email")
        return value


@router.get("/token")
def form_token() -> FormTokenOut:
    issued = int(time.time())
    return FormTokenOut(token=f"{issued}.{_sign(issued)}")


@router.post("", status_code=202, dependencies=[Depends(rate_limit("contact", 5, 3600))])
def submit(body: ContactIn, session: SessionDep) -> dict:
    if body.website:
        raise AppError(422, "VALIDATION_ERROR", "Request rejected")
    check_form_token(body.token, time.time())
    message = ContactMessage(
        name=body.name, phone=body.phone, email=body.email, message=body.message, locale=body.locale
    )
    session.add(message)
    session.flush()
    notify(session, "contact.new")  # no name, phone or text: staff read it in the admin
    session.commit()
    return {"status": "received"}
