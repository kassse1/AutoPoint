import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

STATUSES = ("new", "handled", "spam")


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUSES}", name="status"),
        CheckConstraint("locale IN ('ru', 'kk', 'en')", name="locale"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(16))
    email: Mapped[str | None] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(2000))
    locale: Mapped[str] = mapped_column(String(2))
    status: Mapped[str] = mapped_column(String(10), server_default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
