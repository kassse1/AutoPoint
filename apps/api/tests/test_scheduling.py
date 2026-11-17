"""Availability engine unit tests (pure functions, no database)."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.modules.scheduling.engine import (
    ScheduleData,
    available_slots,
    employee_range,
    finish_time,
    working_intervals,
)

TZ = ZoneInfo("Asia/Almaty")
MON = date(2026, 11, 23)
TUE, WED, THU, SAT, SUN = (MON + timedelta(days=d) for d in (1, 2, 3, 5, 6))
A, B = 1, 2


def at(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm), TZ)


def data(**overrides) -> ScheduleData:
    base = ScheduleData(
        tz=TZ,
        business_hours={d: [(time(9), time(20))] for d in range(1, 7)},  # Mon–Sat, Sunday closed
        business_exceptions={},
        employee_hours={
            A: {d: [(time(9), time(13)), (time(14), time(18))] for d in range(1, 6)},  # lunch break
            B: {d: [(time(10), time(19))] for d in range(2, 7)},
        },
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def test_almaty_is_utc_plus_5() -> None:
    # Kazakhstan moved to a single UTC+5 zone in 2024; stale tzdata would say +6.
    assert at(MON, 10).utcoffset() == timedelta(hours=5)


def test_working_time_is_business_hours_intersected_with_employee_hours() -> None:
    d = data(business_hours={1: [(time(10), time(17))]})
    assert working_intervals(d, A, MON) == [(at(MON, 10), at(MON, 13)), (at(MON, 14), at(MON, 17))]
    assert working_intervals(d, A, SUN) == []


def test_exceptions_override_weekly_rules() -> None:
    d = data(
        business_exceptions={TUE: []},  # public holiday
        employee_exceptions={B: {WED: [(time(12), time(15))]}},  # shorter day
    )
    assert working_intervals(d, B, TUE) == []
    assert working_intervals(d, B, WED) == [(at(WED, 12), at(WED, 15))]


def test_job_skips_lunch_and_continues_next_working_day() -> None:
    d = data()
    assert finish_time(d, A, at(MON, 12), 120) == at(MON, 15)  # 12–13 + 14–15
    # 10 h (longer than A's 8-hour day) from Mon 16:00: Mon 2 h, Tue 8 h → ends Tue 18:00.
    assert finish_time(d, A, at(MON, 16), 600) == at(TUE, 18)


def test_job_that_fits_in_a_day_is_not_split_overnight() -> None:
    d = data()
    assert finish_time(d, A, at(MON, 17), 60) == at(MON, 18)
    assert finish_time(d, A, at(MON, 17, 30), 60) is None  # would end Tuesday morning
    assert finish_time(d, A, at(MON, 9), 480) == at(MON, 18)  # exactly one full day


def test_long_job_spans_days_and_holidays() -> None:
    d = data(business_exceptions={WED: []})
    # B works 9 h/day Tue–Sat. 24 h from Tue 10:00: Tue 9 h, Wed closed, Thu 9 h, Fri 6 h.
    end = finish_time(d, B, at(TUE, 10), 24 * 60)
    assert end == at(THU + timedelta(days=1), 16)


def test_start_outside_working_time_is_rejected() -> None:
    d = data()
    assert finish_time(d, A, at(MON, 13, 30), 30) is None  # lunch
    assert finish_time(d, A, at(MON, 8), 30) is None
    assert finish_time(d, A, at(SUN, 10), 30) is None


def test_busy_range_and_buffer_block_overlaps() -> None:
    d = data(busy={A: [(at(MON, 10), at(MON, 12))]})
    assert employee_range(d, A, at(MON, 9), 60, buffer_min=30) is None  # 9:00–10:30 overlaps
    assert employee_range(d, A, at(MON, 9), 30, buffer_min=30) == (at(MON, 9, 30), at(MON, 10))
    assert employee_range(d, A, at(MON, 12), 60, buffer_min=0) == (at(MON, 13), at(MON, 13))


def test_slots_respect_grid_lead_time_horizon_and_any_free_employee() -> None:
    d = data(busy={B: [(at(TUE, 10), at(TUE, 19))]})
    days = available_slots(
        d,
        [A, B],
        60,
        date_from=MON,
        date_to=SUN,
        earliest=at(MON, 15),  # lead time already applied
        last_day=SAT,
        step_min=30,
        buffer_min=0,
    )
    assert [t.strftime("%H:%M") for t in days[MON]] == ["15:00", "15:30", "16:00", "16:30", "17:00"]
    # Tuesday: B is fully booked, A still offers 9:00–12:00 and 14:00–17:00 starts.
    assert days[TUE][0] == at(TUE, 9) and at(TUE, 18) not in days[TUE]
    assert days[SAT] and not days[SUN]  # Saturday only B; Sunday closed

    limited = available_slots(
        d, [A, B], 60, date_from=MON, date_to=SUN, earliest=at(MON, 0), last_day=WED,
        step_min=30, buffer_min=0,
    )  # fmt: skip
    assert limited[THU] == []  # beyond the booking horizon


def test_grid_aligns_to_clock_even_if_shift_starts_off_grid() -> None:
    d = data(employee_hours={A: {1: [(time(9, 10), time(11))]}})
    days = available_slots(
        d, [A], 30, date_from=MON, date_to=MON, earliest=at(MON, 0), last_day=MON,
        step_min=30, buffer_min=0,
    )  # fmt: skip
    assert [t.strftime("%H:%M") for t in days[MON]] == ["09:30", "10:00", "10:30"]
