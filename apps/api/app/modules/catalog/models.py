from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, Timestamps
from app.i18n import ru_required

SLUG_CHECK = "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'"


class ServiceCategory(Base):
    __tablename__ = "service_categories"
    __table_args__ = (ru_required("name_i18n"), CheckConstraint(SLUG_CHECK, name="slug_format"))

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


class Service(Timestamps, Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint(SLUG_CHECK, name="slug_format"),
        CheckConstraint("price_display IN ('fixed', 'from')", name="price_display"),
        ru_required("name_i18n"),
        ru_required("summary_i18n"),
        ru_required("description_i18n"),
        ru_required("includes_i18n"),
        ru_required("benefits_i18n"),
        ru_required("process_i18n"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("service_categories.id", ondelete="RESTRICT"), index=True
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    summary_i18n: Mapped[dict] = mapped_column(JSONB)
    description_i18n: Mapped[dict] = mapped_column(JSONB)
    includes_i18n: Mapped[dict] = mapped_column(JSONB)  # {"ru": ["…", "…"]}
    benefits_i18n: Mapped[dict] = mapped_column(JSONB)  # {"ru": ["…"]}
    process_i18n: Mapped[dict] = mapped_column(JSONB)  # {"ru": [{"title": …, "text": …}]}
    image_url: Mapped[str | None] = mapped_column(String(500))
    price_display: Mapped[str] = mapped_column(String(10), server_default="from")
    addon_eligible: Mapped[bool] = mapped_column(server_default=text("false"))
    is_featured: Mapped[bool] = mapped_column(server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))

    category: Mapped[ServiceCategory] = relationship()


class ServiceOption(Base):
    __tablename__ = "service_options"
    __table_args__ = (
        UniqueConstraint("service_id", "code"),
        # Target of the composite FK from price_entries (option must belong to the service).
        UniqueConstraint("id", "service_id"),
        CheckConstraint("code ~ '^[a-z0-9_]+$'", name="code_format"),
        ru_required("name_i18n"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(50))
    # Options sharing a group_code are mutually exclusive; null = independent checkbox.
    group_code: Mapped[str | None] = mapped_column(String(50))
    is_default: Mapped[bool] = mapped_column(server_default=text("false"))
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    description_i18n: Mapped[dict | None] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


class VehicleCategory(Base):
    __tablename__ = "vehicle_categories"
    __table_args__ = (
        CheckConstraint("code ~ '^[a-z0-9_]+$'", name="code_format"),
        ru_required("name_i18n"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    examples_i18n: Mapped[dict | None] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


class PriceEntry(Base):
    """Price matrix cell: (service, option or base, vehicle category) → price and duration."""

    __tablename__ = "price_entries"
    __table_args__ = (
        UniqueConstraint(
            "service_id", "option_id", "vehicle_category_id", postgresql_nulls_not_distinct=True
        ),
        ForeignKeyConstraint(
            ["option_id", "service_id"],
            ["service_options.id", "service_options.service_id"],
            ondelete="CASCADE",
            name="fk_price_entries_option_of_service",
        ),
        CheckConstraint("price_kzt >= 0", name="price_non_negative"),
        CheckConstraint("duration_min >= 0", name="duration_non_negative"),
        CheckConstraint("option_id IS NOT NULL OR duration_min > 0", name="base_has_duration"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    option_id: Mapped[int | None] = mapped_column(Integer)
    vehicle_category_id: Mapped[int] = mapped_column(
        ForeignKey("vehicle_categories.id", ondelete="RESTRICT"), index=True
    )
    price_kzt: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer)
