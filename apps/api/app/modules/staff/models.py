import uuid

from sqlalchemy import ForeignKey, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, Timestamps
from app.i18n import ru_required


class Employee(Timestamps, Base):
    """Staff member. `user_id` links the login account (employees see their own jobs)."""

    __tablename__ = "employees"
    __table_args__ = (ru_required("position_i18n"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )
    display_name: Mapped[str] = mapped_column(String(100))
    position_i18n: Mapped[dict] = mapped_column(JSONB)
    bio_i18n: Mapped[dict | None] = mapped_column(JSONB)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    is_public: Mapped[bool] = mapped_column(server_default=text("false"))
    is_bookable: Mapped[bool] = mapped_column(server_default=text("true"))
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
