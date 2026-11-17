"""Availability as pure functions (no database), so every rule is unit-testable.

- An employee's working time on a date = business hours ∩ employee hours, where a
  date-specific exception replaces the weekly rule (closed → no time at all).
- A job that is longer than one working day continues in the next working intervals,
  so a 16-hour job starting Tuesday 10:00 may end Thursday. The employee is held for the
  whole wall-clock range [start, end + buffer); nights fall inside it, which is fine.
- A start is offered if at least one qualified employee is free for that whole range.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

Hours = list[tuple[time, time]]
Range = tuple[datetime, datetime]

MAX_JOB_DAYS = 30  # a job that can't finish within this many days is never offered


@dataclass
class ScheduleData:
    tz: ZoneInfo
    business_hours: dict[int, Hours]  # ISO weekday → intervals
    business_exceptions: dict[date, Hours]  # [] = closed
    employee_hours: dict[int, dict[int, Hours]]
    employee_exceptions: dict[int, dict[date, Hours]] = field(default_factory=dict)
    busy: dict[int, list[Range]] = field(default_factory=dict)  # existing bookings


def _intersect(a: Hours, b: Hours) -> Hours:
    out = []
    for a1, a2 in a:
        for b1, b2 in b:
            start, end = max(a1, b1), min(a2, b2)
            if start < end:
                out.append((start, end))
    return sorted(out)


def working_intervals(data: ScheduleData, employee: int, day: date) -> list[Range]:
    weekday = day.isoweekday()
    business = data.business_exceptions.get(day, data.business_hours.get(weekday, []))
    personal = data.employee_exceptions.get(employee, {}).get(
        day, data.employee_hours.get(employee, {}).get(weekday, [])
    )
    return [
        (datetime.combine(day, s, data.tz), datetime.combine(day, e, data.tz))
        for s, e in _intersect(business, personal)
    ]


def finish_time(
    data: ScheduleData, employee: int, start: datetime, minutes: int
) -> datetime | None:
    """When a job of `minutes` working minutes started at `start` ends, or None if `start`
    isn't inside the employee's working time (or the job can't finish within MAX_JOB_DAYS).

    A job that fits into the employee's working day must finish that day: a 1-hour wash is
    never offered at 17:30 to "finish" tomorrow morning. Only longer jobs span days.
    """
    first_day = start.astimezone(data.tz).date()
    today = working_intervals(data, employee, first_day)
    if not any(a <= start < b for a, b in today):
        return None
    fits_in_a_day = timedelta(minutes=minutes) <= sum((b - a for a, b in today), timedelta())
    remaining = timedelta(minutes=minutes)
    cursor = start
    for offset in range(1 if fits_in_a_day else MAX_JOB_DAYS):
        for a, b in working_intervals(data, employee, first_day + timedelta(days=offset)):
            if b <= cursor:
                continue
            segment_start = max(a, cursor)
            if remaining <= b - segment_start:
                return segment_start + remaining
            remaining -= b - segment_start
            cursor = b
    return None


def is_free(busy: list[Range], start: datetime, end: datetime) -> bool:
    return all(not (s < end and start < e) for s, e in busy)


def employee_range(
    data: ScheduleData, employee: int, start: datetime, minutes: int, buffer_min: int
) -> Range | None:
    """(ends_at, blocked_until) if the employee can take the job at `start`, else None."""
    end = finish_time(data, employee, start, minutes)
    if end is None:
        return None
    blocked_until = end + timedelta(minutes=buffer_min)
    return (
        (end, blocked_until) if is_free(data.busy.get(employee, []), start, blocked_until) else None
    )


def candidate_starts(data: ScheduleData, employee: int, day: date, step_min: int) -> list[datetime]:
    """Start times on the business-local grid (:00, :30, … for a 30-minute step)."""
    out = []
    for a, b in working_intervals(data, employee, day):
        midnight = datetime.combine(day, time(0), data.tz)
        steps = -(-int((a - midnight).total_seconds() // 60) // step_min)  # ceil
        t = midnight + timedelta(minutes=steps * step_min)
        while t < b:
            out.append(t)
            t += timedelta(minutes=step_min)
    return out


def available_slots(
    data: ScheduleData,
    employees: list[int],
    minutes: int,
    *,
    date_from: date,
    date_to: date,
    earliest: datetime,
    last_day: date,
    step_min: int,
    buffer_min: int,
) -> dict[date, list[datetime]]:
    days: dict[date, list[datetime]] = {}
    day = date_from
    while day <= date_to:
        starts: set[datetime] = set()
        if day <= last_day:
            for employee in employees:
                for t in candidate_starts(data, employee, day, step_min):
                    if (
                        t >= earliest
                        and t not in starts
                        and employee_range(data, employee, t, minutes, buffer_min)
                    ):
                        starts.add(t)
        days[day] = sorted(starts)
        day += timedelta(days=1)
    return days
