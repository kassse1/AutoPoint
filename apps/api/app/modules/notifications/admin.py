from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select

from app.deps import Page, PageQuery, PageSizeQuery, SessionDep, paginate
from app.errors import AppError
from app.modules.audit.models import record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.notifications.models import Notification, notify
from app.modules.notifications.telegram import is_configured, render

router = APIRouter(prefix="/admin/notifications", tags=["admin: notifications"])

Admin = Annotated[CurrentUser, Depends(require(Permission.SETTINGS_WRITE))]


class NotificationOut(BaseModel):
    id: int
    event_type: str
    status: str
    attempts: int
    last_error: str | None
    created_at: datetime
    sent_at: datetime | None
    next_attempt_at: datetime
    text: str


class SummaryOut(BaseModel):
    configured: bool
    pending: int
    dead: int
    sent_24h: int


@router.get("/summary")
def summary(user: Admin, session: SessionDep) -> SummaryOut:
    def count(*where) -> int:
        return session.scalar(select(func.count()).select_from(Notification).where(*where))

    return SummaryOut(
        configured=is_configured(),
        pending=count(Notification.status == "pending"),
        dead=count(Notification.status == "dead"),
        sent_24h=count(
            Notification.status == "sent",
            Notification.sent_at > datetime.now(UTC) - timedelta(days=1),
        ),
    )


@router.get("")
def list_notifications(
    user: Admin,
    session: SessionDep,
    status: Literal["pending", "sent", "dead"] | None = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 50,
) -> Page[NotificationOut]:
    query = select(Notification).order_by(Notification.id.desc())
    if status:
        query = query.where(Notification.status == status)
    rows, total = paginate(session, query, page, page_size)
    return Page(
        items=[
            NotificationOut(
                id=n.id,
                event_type=n.event_type,
                status=n.status,
                attempts=n.attempts,
                last_error=n.last_error,
                created_at=n.created_at,
                sent_at=n.sent_at,
                next_attempt_at=n.next_attempt_at,
                text=render(n.event_type, n.payload),
            )
            for n in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{notification_id}/retry", status_code=204)
def retry(notification_id: int, user: Admin, session: SessionDep) -> None:
    row = session.get(Notification, notification_id)
    if row is None:
        raise AppError(404, "NOTIFICATION_NOT_FOUND")
    if row.status != "dead":
        raise AppError(409, "NOT_FAILED", "Only failed notifications can be retried")
    row.status, row.attempts, row.next_attempt_at = "pending", 0, datetime.now(UTC)
    record_user(session, user, "notification.retried", "notification", row.id)
    session.commit()


@router.post("/test", status_code=202)
def send_test(user: Admin, session: SessionDep) -> SummaryOut:
    """Queues a test message; the worker delivers it within seconds if Telegram is set up."""
    notify(session, "test")
    record_user(session, user, "notification.test", "notification", "test")
    session.commit()
    return summary(user, session)
