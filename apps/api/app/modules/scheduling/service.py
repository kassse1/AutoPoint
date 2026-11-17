"""Loads schedules and existing bookings from the database for the availability engine."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.bookings.models import ACTIVE_STATUSES, Booking
from app.modules.scheduling.engine import MAX_JOB_DAYS, ScheduleData
from app.modules.scheduling.models import EmployeeSchedule, EmployeeService, ScheduleException
from app.modules.site.models import BusinessHours
from app.modules.staff.models import Employee


def qualified_employees(session: Session, service_ids: list[int]) -> list[int]:
    """Active, bookable employees who can perform every one of the given services."""
    return list(
        session.scalars(
            select(Employee.id)
            .join(EmployeeService, EmployeeService.employee_id == Employee.id)
            .where(
                Employee.is_active,
                Employee.is_bookable,
                EmployeeService.service_id.in_(service_ids),
            )
            .group_by(Employee.id)
            .having(func.count() == len(set(service_ids)))
            .order_by(Employee.sort_order, Employee.id)
        )
    )


def load_schedule(
    session: Session, tz: ZoneInfo, employees: list[int], date_from: date, date_to: date
) -> ScheduleData:
    # Jobs can spill over into following days, so look a bit past the requested range.
    last = date_to + timedelta(days=MAX_JOB_DAYS)
    data = ScheduleData(tz=tz, business_hours={}, business_exceptions={}, employee_hours={})
    for h in session.scalars(select(BusinessHours)):
        data.business_hours.setdefault(h.weekday, []).append((h.opens, h.closes))
    for s in session.scalars(
        select(EmployeeSchedule).where(EmployeeSchedule.employee_id.in_(employees))
    ):
        data.employee_hours.setdefault(s.employee_id, {}).setdefault(s.weekday, []).append(
            (s.starts_local, s.ends_local)
        )
    for x in session.scalars(
        select(ScheduleException).where(
            ScheduleException.day.between(date_from, last),
            (ScheduleException.employee_id.is_(None))
            | ScheduleException.employee_id.in_(employees),
        )
    ):
        hours = [] if x.is_closed else [(x.opens, x.closes)]
        if x.employee_id is None:
            data.business_exceptions[x.day] = hours
        else:
            data.employee_exceptions.setdefault(x.employee_id, {})[x.day] = hours

    range_start = datetime.combine(date_from, datetime.min.time(), tz)
    range_end = datetime.combine(last, datetime.min.time(), tz)
    for b in session.execute(
        select(Booking.employee_id, Booking.starts_at, Booking.blocked_until).where(
            Booking.employee_id.in_(employees),
            Booking.status.in_(ACTIVE_STATUSES),
            Booking.blocked_until > range_start,
            Booking.starts_at < range_end,
        )
    ):
        data.busy.setdefault(b.employee_id, []).append((b.starts_at, b.blocked_until))
    return data
