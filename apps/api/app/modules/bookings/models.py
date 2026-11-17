import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, Timestamps

# Statuses that hold the employee's time. Used by the exclusion constraint (see migration).
ACTIVE_STATUSES = ("pending", "confirmed", "in_progress")
STATUSES = (*ACTIVE_STATUSES, "completed", "cancelled", "no_show")


class Booking(Timestamps, Base):
    """One appointment. Double booking of an employee is impossible at the database level:
    an exclusion constraint forbids overlapping [starts_at, blocked_until) ranges for the same
    employee while the booking is active.
    """

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUSES}", name="status"),
        CheckConstraint("source IN ('web', 'admin')", name="source"),
        CheckConstraint("ends_at > starts_at AND blocked_until >= ends_at", name="time_order"),
        CheckConstraint(
            "discount_kzt BETWEEN 0 AND subtotal_kzt AND total_kzt = subtotal_kzt - discount_kzt",
            name="money",
        ),
        CheckConstraint("final_amount_kzt IS NULL OR final_amount_kzt >= 0", name="final_amount"),
        CheckConstraint(
            "status <> 'completed' OR final_amount_kzt IS NOT NULL", name="completed_has_amount"
        ),
        CheckConstraint("locale IN ('ru', 'kk', 'en')", name="locale"),
        Index("ix_bookings_starts_at", "starts_at"),
        Index("ix_bookings_status_starts_at", "status", "starts_at"),
        Index("ix_bookings_customer", "customer_id", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(12), unique=True)
    manage_token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    idempotency_key: Mapped[uuid.UUID | None] = mapped_column(unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    vehicle_category_id: Mapped[int] = mapped_column(
        ForeignKey("vehicle_categories.id", ondelete="RESTRICT")
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    source: Mapped[str] = mapped_column(String(10), server_default="web")
    # Snapshots: what the customer saw when booking, even if the customer record changes.
    customer_name: Mapped[str] = mapped_column(String(100))
    customer_phone: Mapped[str] = mapped_column(String(16))
    customer_email: Mapped[str | None] = mapped_column(String(200))
    vehicle_note: Mapped[str | None] = mapped_column(String(200))
    customer_comment: Mapped[str | None] = mapped_column(String(1000))
    locale: Mapped[str] = mapped_column(String(2), server_default="ru")
    subtotal_kzt: Mapped[int] = mapped_column(Integer)
    discount_kzt: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    total_kzt: Mapped[int] = mapped_column(Integer)
    discount_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("discount_rules.id", ondelete="SET NULL")
    )
    discount_name_i18n: Mapped[dict | None] = mapped_column(JSONB)
    final_amount_kzt: Mapped[int | None] = mapped_column(Integer)
    internal_notes: Mapped[str | None] = mapped_column(String(4000))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(500))

    items: Mapped[list["BookingItem"]] = relationship(
        back_populates="booking", order_by="BookingItem.sort_order", lazy="selectin"
    )


class BookingItem(Base):
    """A booked service with its options, priced at booking time (snapshot)."""

    __tablename__ = "booking_items"
    __table_args__ = (
        CheckConstraint("role IN ('primary', 'addon')", name="role"),
        CheckConstraint("price_kzt >= 0 AND duration_min >= 0", name="non_negative"),
        Index(
            "uq_booking_items_one_primary",
            "booking_id",
            unique=True,
            postgresql_where=text("role = 'primary'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"))
    role: Mapped[str] = mapped_column(String(10))
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    # [{"code", "name_i18n", "price_kzt", "duration_min"}]
    options: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    price_kzt: Mapped[int] = mapped_column(Integer)  # service + its options
    duration_min: Mapped[int] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))

    booking: Mapped[Booking] = relationship(back_populates="items")
