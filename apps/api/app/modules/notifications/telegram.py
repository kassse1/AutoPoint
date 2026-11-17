"""Rendering and delivery of staff notifications to a Telegram chat, plus the outbox batch."""

import json
import logging
import random
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.modules.notifications.models import Notification

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 8
STATUS_RU = {"confirmed": "подтверждена", "cancelled": "отменена", "no_show": "неявка"}


@dataclass(frozen=True)
class SendResult:
    ok: bool
    retryable: bool = True
    error: str | None = None
    retry_after: int | None = None


def render(event_type: str, p: dict) -> str:
    """Russian message text. Payloads hold no customer personal data by design."""
    base = get_settings().public_url.rstrip("/")
    booking = f"{base}/admin/bookings/{p.get('booking_id')}"
    lines: list[str]
    if event_type == "booking.created":
        source = "админ-панель" if p.get("source") == "admin" else "сайт"
        lines = [
            f"Новая запись {p['reference']} ({source})",
            f"{p['services']} · {p['vehicle']}",
            f"{p['starts']} · мастер: {p['employee']}",
            booking,
        ]
    elif event_type == "booking.status":
        by = "клиентом" if p.get("by") == "customer" else "персоналом"
        lines = [
            f"Запись {p['reference']} {STATUS_RU.get(p['status'], p['status'])} ({by})",
            p["starts"],
            booking,
        ]
    elif event_type == "booking.rescheduled":
        lines = [f"Запись {p['reference']} перенесена", f"{p['old']} → {p['starts']}", booking]
    elif event_type == "contact.new":
        lines = ["Новое сообщение с сайта", f"{base}/admin/messages"]
    elif event_type == "auth.locked":
        lines = [
            f"Аккаунт сотрудника ({p['role']}) заблокирован после неудачных входов",
            f"{base}/admin/users",
        ]
    elif event_type == "auth.refresh_reuse":
        lines = [
            "Повторное использование токена входа: сессии пользователя завершены",
            f"{base}/admin/users",
        ]
    elif event_type == "test":
        lines = ["Тестовое уведомление AutoPoint: интеграция с Telegram работает."]
    else:
        lines = [event_type]
    return "\n".join(lines)


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def send_telegram(text: str) -> SendResult:
    """POST to the Bot API. The URL contains the token: never log it."""
    settings = get_settings()
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        data=json.dumps(
            {"chat_id": settings.telegram_chat_id, "text": text, "disable_web_page_preview": True}
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10):  # noqa: S310 - fixed https URL
            return SendResult(ok=True)
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read() or b"{}")
        except ValueError:
            body = {}
        description = str(body.get("description") or f"HTTP {error.code}")[:400]
        if error.code == 429:
            retry_after = (body.get("parameters") or {}).get("retry_after")
            return SendResult(ok=False, error=description, retry_after=retry_after)
        # 4xx other than 429 (bad token, unknown chat, bot blocked): retrying won't help.
        return SendResult(ok=False, retryable=error.code >= 500, error=description)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return SendResult(ok=False, error=f"network: {type(error).__name__}")


def backoff(attempts: int, retry_after: int | None) -> timedelta:
    """Telegram's own retry_after when given; otherwise 30 s doubling to 1 h, with jitter."""
    if retry_after:
        return timedelta(seconds=retry_after + 1)
    seconds = min(30 * 2 ** (attempts - 1), 3600)
    return timedelta(seconds=seconds * random.uniform(0.8, 1.2))  # noqa: S311 - jitter only


def process_batch(
    session: Session,
    now: datetime,
    sender: Callable[[str], SendResult] = send_telegram,
    limit: int = 20,
) -> int:
    """Deliver due notifications. Rows are locked with SKIP LOCKED, so several workers never
    send the same row. Delivery is at-least-once: a crash after sending but before commit can
    repeat one message."""
    rows = session.scalars(
        select(Notification)
        .where(Notification.status == "pending", Notification.next_attempt_at <= now)
        .order_by(Notification.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    for row in rows:
        result = sender(render(row.event_type, row.payload))
        if result.ok:
            row.status, row.sent_at, row.last_error = "sent", now, None
            continue
        row.attempts += 1
        row.last_error = result.error
        if not result.retryable or row.attempts >= MAX_ATTEMPTS:
            row.status = "dead"
            logger.warning("Notification %s gave up: %s", row.id, result.error)
        else:
            row.next_attempt_at = now + backoff(row.attempts, result.retry_after)
    session.commit()
    return len(rows)
