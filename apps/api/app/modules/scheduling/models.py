from datetime import date, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class EmployeeService(Base):
    """Which services an employee can perform (only they are offered slots for it)."""

    __tablename__ = "employee_services"

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class EmployeeSchedule(Base):
    """Weekly working intervals in business-local time. Several per day are allowed (breaks).

    Overlapping intervals for the same employee and weekday are rejected by an exclusion
    constraint created in the migration.
    """

    __tablename__ = "employee_schedules"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_range"),
        CheckConstraint("starts_local < ends_local", name="starts_before_ends"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column(SmallInteger)  # 1 = Monday
    starts_local: Mapped[time] = mapped_column(Time)
    ends_local: Mapped[time] = mapped_column(Time)


class ScheduleException(Base):
    """A holiday or changed hours on one date: business-wide (employee_id NULL) or per employee."""

    __tablename__ = "schedule_exceptions"
    __table_args__ = (
        UniqueConstraint("employee_id", "day", postgresql_nulls_not_distinct=True),
        CheckConstraint(
            "is_closed OR (opens IS NOT NULL AND closes IS NOT NULL AND opens < closes)",
            name="closed_or_valid_hours",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date, index=True)
    is_closed: Mapped[bool] = mapped_column(server_default=text("true"))
    opens: Mapped[time | None] = mapped_column(Time)
    closes: Mapped[time | None] = mapped_column(Time)
    reason: Mapped[str | None] = mapped_column(String(200))
