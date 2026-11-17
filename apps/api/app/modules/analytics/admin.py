"""Dashboard figures. Revenue is only what staff recorded when completing a job
(`final_amount_kzt`) — never estimates or prices of open bookings."""

from datetime import date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Date, case, cast, func, select

from app.deps import SessionDep
from app.errors import AppError
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.bookings import public
from app.modules.bookings.models import ACTIVE_STATUSES, Booking
from app.modules.site.models import get_site_settings

router = APIRouter(prefix="/admin/analytics", tags=["admin: analytics"])

Reader = Annotated[CurrentUser, Depends(require(Permission.ANALYTICS_READ))]


class Day(BaseModel):
    date: date
    bookings: int  # starting that day, not cancelled
    completed: int
    revenue_kzt: int  # recorded amounts of completed jobs that started that day


class Summary(BaseModel):
    today: date
    today_bookings: int
    pending_upcoming: int  # waiting for confirmation
    confirmed_upcoming: int
    date_from: date
    date_to: date
    bookings: int
    completed: int
    cancelled: int
    no_show: int
    revenue_kzt: int
    days: list[Day]


@router.get("")
def summary(
    user: Reader,
    session: SessionDep,
    date_from: date | None = None,  # business-local, inclusive; default: last 30 days
    date_to: date | None = None,
) -> Summary:
    tz_name = get_site_settings(session).timezone
    tz = ZoneInfo(tz_name)
    now = public.utcnow()
    today = now.astimezone(tz).date()
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=29)
    if not date_from <= date_to <= date_from + timedelta(days=366):
        raise AppError(422, "INVALID_RANGE", "Up to one year, date_from ≤ date_to")

    start = datetime.combine(date_from, time(0), tz)
    end = datetime.combine(date_to + timedelta(days=1), time(0), tz)
    local_day = cast(func.timezone(tz_name, Booking.starts_at), Date)
    counted = Booking.status != "cancelled"
    completed = Booking.status == "completed"
    rows = session.execute(
        select(
            local_day,
            func.count().filter(counted),
            func.count().filter(completed),
            func.coalesce(func.sum(case((completed, Booking.final_amount_kzt), else_=0)), 0),
            func.count().filter(Booking.status == "cancelled"),
            func.count().filter(Booking.status == "no_show"),
        )
        .where(Booking.starts_at >= start, Booking.starts_at < end)
        .group_by(local_day)
    ).all()
    by_day = {r[0]: r for r in rows}

    def upcoming(status: str) -> int:
        return session.scalar(
            select(func.count())
            .select_from(Booking)
            .where(Booking.status == status, Booking.blocked_until > now)
        )

    today_start = datetime.combine(today, time(0), tz)
    return Summary(
        today=today,
        today_bookings=session.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.status.in_((*ACTIVE_STATUSES, "completed")),
                Booking.starts_at >= today_start,
                Booking.starts_at < today_start + timedelta(days=1),
            )
        ),
        pending_upcoming=upcoming("pending"),
        confirmed_upcoming=upcoming("confirmed"),
        date_from=date_from,
        date_to=date_to,
        bookings=sum(r[1] for r in rows),
        completed=sum(r[2] for r in rows),
        cancelled=sum(r[4] for r in rows),
        no_show=sum(r[5] for r in rows),
        revenue_kzt=sum(r[3] for r in rows),
        days=[
            Day(
                date=d,
                bookings=by_day[d][1] if d in by_day else 0,
                completed=by_day[d][2] if d in by_day else 0,
                revenue_kzt=by_day[d][3] if d in by_day else 0,
            )
            for d in (date_from + timedelta(days=i) for i in range((date_to - date_from).days + 1))
        ],
    )
