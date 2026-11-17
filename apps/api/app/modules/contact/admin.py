import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.deps import Page, PageQuery, PageSizeQuery, SessionDep, paginate
from app.errors import AppError
from app.modules.audit.models import record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.contact.models import ContactMessage

router = APIRouter(prefix="/admin/contact-messages", tags=["admin: contact"])

Reader = Annotated[CurrentUser, Depends(require(Permission.CUSTOMERS_READ))]
Writer = Annotated[CurrentUser, Depends(require(Permission.CUSTOMERS_WRITE))]
Status = Literal["new", "handled", "spam"]


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    phone: str
    email: str | None
    message: str
    locale: str
    status: str
    created_at: datetime
    handled_at: datetime | None


class MessageStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status


@router.get("")
def list_messages(
    user: Reader,
    session: SessionDep,
    status: Status | None = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 50,
) -> Page[MessageOut]:
    query = select(ContactMessage).order_by(ContactMessage.created_at.desc())
    if status:
        query = query.where(ContactMessage.status == status)
    rows, total = paginate(session, query, page, page_size)
    return Page(
        items=[MessageOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/{message_id}")
def set_status(
    message_id: uuid.UUID, body: MessageStatusIn, user: Writer, session: SessionDep
) -> MessageOut:
    message = session.get(ContactMessage, message_id)
    if message is None:
        raise AppError(404, "MESSAGE_NOT_FOUND")
    before = message.status
    message.status = body.status
    message.handled_at = datetime.now(UTC) if body.status != "new" else None
    record_user(
        session,
        user,
        "contact.status_changed",
        "contact_message",
        message.id,
        before={"status": before},
        after={"status": body.status},
    )
    session.commit()
    return MessageOut.model_validate(message)
