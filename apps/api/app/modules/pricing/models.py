from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.i18n import ru_required


class DiscountRuleService(Base):
    __tablename__ = "discount_rule_services"

    rule_id: Mapped[int] = mapped_column(
        ForeignKey("discount_rules.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), primary_key=True
    )


class DiscountRule(Base):
    """`bundle`: all linked services booked together; `min_services`: at least N services."""

    __tablename__ = "discount_rules"
    __table_args__ = (
        CheckConstraint("kind IN ('bundle', 'min_services')", name="kind"),
        CheckConstraint("(percent IS NULL) <> (amount_kzt IS NULL)", name="percent_xor_amount"),
        CheckConstraint("percent BETWEEN 1 AND 90", name="percent_range"),
        CheckConstraint("amount_kzt > 0", name="amount_positive"),
        CheckConstraint("kind <> 'min_services' OR min_services >= 2", name="min_services_set"),
        CheckConstraint(
            "valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to", name="dates"
        ),
        ru_required("name_i18n"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    name_i18n: Mapped[dict] = mapped_column(JSONB)
    percent: Mapped[int | None] = mapped_column(SmallInteger)
    amount_kzt: Mapped[int | None] = mapped_column(Integer)
    min_services: Mapped[int | None] = mapped_column(SmallInteger)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))

    services: Mapped[list[DiscountRuleService]] = relationship(lazy="selectin")
