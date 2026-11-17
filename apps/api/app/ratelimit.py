"""Fixed-window rate limiting stored in PostgreSQL (no Redis needed at this scale)."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import DateTime, Integer, String, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base, engine
from app.errors import AppError

HIT_SQL = text(
    "INSERT INTO rate_limit_counters (key, window_start, count) VALUES (:k, :w, 1) "
    "ON CONFLICT (key, window_start) "
    "DO UPDATE SET count = rate_limit_counters.count + 1 RETURNING count"
)


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"
    # Losing counters on a crash is harmless; UNLOGGED skips the write-ahead log.
    __table_args__ = ({"prefixes": ["UNLOGGED"]},)

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)


HitCounter = Callable[[str, datetime], int]


def count_hit(key: str, window: datetime) -> int:
    # Own short transaction: the hit is kept even if the request fails, and the connection
    # goes back to the pool before the endpoint runs (no request ever holds two connections).
    with engine.begin() as conn:
        return conn.execute(HIT_SQL, {"k": key, "w": window}).scalar_one()


def get_hit_counter() -> HitCounter:
    return count_hit


def rate_limit(name: str, limit: int, window_seconds: int) -> Callable:
    def dependency(request: Request, hit: Annotated[HitCounter, Depends(get_hit_counter)]) -> None:
        # Behind the proxy, uvicorn --proxy-headers puts the real client address here.
        client = request.client.host if request.client else "unknown"
        now = datetime.now(UTC).timestamp()
        window = datetime.fromtimestamp(now - now % window_seconds, UTC)
        if hit(f"{name}:{client}", window) > limit:
            retry = int(window.timestamp() + window_seconds - now) + 1
            raise AppError(429, "RATE_LIMITED", headers={"Retry-After": str(retry)})

    return dependency


def purge_old_counters(session: Session, older_than_seconds: int = 86_400) -> int:
    result = session.execute(
        text(
            "DELETE FROM rate_limit_counters WHERE window_start < now() - make_interval(secs => :s)"
        ),
        {"s": older_than_seconds},
    )
    return result.rowcount
