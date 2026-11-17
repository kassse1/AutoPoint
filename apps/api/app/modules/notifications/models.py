"""Transactional outbox: notifications are rows written in the same transaction as the
change they describe, and a separate worker delivers them. A failed or slow Telegram never
blocks or breaks a booking request, and nothing is sent for a change that rolled back.

Payloads carry no customer personal data (no names, phones or emails): only references,
services, times and admin links. Telegram is a third-party service outside Kazakhstan.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Index,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base

STATUSES = ("pending", "sent", "dead")


class Notification(Base):
    __tablename__ = "notification_outbox"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUSES}", name="status"),
        Index("ix_outbox_due", "next_attempt_at", postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(10), server_default="pending")
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def notify(session: Session, event_type: str, **payload: Any) -> None:
    """Queue a staff notification in the caller's transaction."""
    session.add(Notification(event_type=event_type, payload=payload))
