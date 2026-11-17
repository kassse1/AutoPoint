import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base
from app.logs import request_id_var


class AuditLog(Base):
    """Append-only record of who changed what. Also serves as the booking history."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint("actor_kind IN ('user', 'public', 'system')", name="actor_kind"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # The FK to users is added in Phase 4 together with the users table.
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column()
    actor_kind: Mapped[str] = mapped_column(String(10))
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(64))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    request_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


def record(
    session: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: Any,
    actor_kind: str = "public",
    actor_user_id: uuid.UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    """Add an audit row in the caller's transaction (it commits or rolls back with the change)."""
    session.add(
        AuditLog(
            actor_kind=actor_kind,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            before=before,
            after=after,
            request_id=request_id_var.get(),
        )
    )
