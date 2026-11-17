import re
import uuid

from sqlalchemy import CheckConstraint, String
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, Timestamps

_E164 = re.compile(r"^\+[1-9]\d{9,14}$")


def normalize_phone(raw: str) -> str | None:
    """'8 (701) 123-45-67' / '7701…' / '+7 701…' → '+77011234567'; None if not a phone.

    shortcut: format check only (no carrier/number-range validation); switch to the
    `phonenumbers` library if invalid numbers become a real problem.
    """
    digits = re.sub(r"[\s\-().]", "", raw)
    if re.fullmatch(r"8\d{10}", digits):  # Kazakhstan/Russia trunk prefix
        digits = "+7" + digits[1:]
    elif re.fullmatch(r"7\d{10}", digits):
        digits = "+" + digits
    return digits if _E164.match(digits) else None


class Customer(Timestamps, Base):
    """One row per phone number. Public bookings never overwrite an existing customer's data."""

    __tablename__ = "customers"
    __table_args__ = (CheckConstraint(r"phone_e164 ~ '^\+[1-9][0-9]{9,14}$'", name="phone_e164"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    phone_e164: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(CITEXT)
    notes: Mapped[str | None] = mapped_column(String(2000))
