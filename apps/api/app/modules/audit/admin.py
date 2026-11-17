import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import Page, PageQuery, PageSizeQuery, SessionDep, paginate
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.auth.permissions import CurrentUser, Permission, require

router = APIRouter(prefix="/admin/audit-logs", tags=["admin: audit"])

Reader = Annotated[CurrentUser, Depends(require(Permission.AUDIT_READ))]


class AuditOut(BaseModel):
    id: int
    created_at: datetime
    actor_kind: str
    actor_user_id: uuid.UUID | None
    actor_name: str | None
    action: str
    entity_type: str
    entity_id: str
    before: dict | None
    after: dict | None
    request_id: str | None


@router.get("")
def list_audit(
    user: Reader,
    session: SessionDep,
    entity_type: Annotated[str | None, Query(max_length=50)] = None,
    entity_id: Annotated[str | None, Query(max_length=64)] = None,
    actor_user_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 50,
) -> Page[AuditOut]:
    query = select(AuditLog).order_by(AuditLog.id.desc())
    for column, value in (
        (AuditLog.entity_type, entity_type),
        (AuditLog.entity_id, entity_id),
        (AuditLog.actor_user_id, actor_user_id),
    ):
        if value is not None:
            query = query.where(column == value)
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at < date_to)
    rows, total = paginate(session, query, page, page_size)
    names = {u.id: u.full_name for u in session.scalars(select(User))}
    return Page(
        items=[
            AuditOut(
                **{k: getattr(r, k) for k in AuditOut.model_fields if hasattr(r, k)},
                actor_name=names.get(r.actor_user_id),
            )
            for r in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
