from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import LocaleQuery, SessionDep
from app.i18n import DEFAULT_LOCALE, pick
from app.modules.staff.models import Employee

router = APIRouter(prefix="/public", tags=["public"])


class TeamMember(BaseModel):
    id: int
    display_name: str
    position: str
    bio: str | None
    photo_url: str | None
    is_demo: bool


@router.get("/team")
def list_team(session: SessionDep, locale: LocaleQuery = DEFAULT_LOCALE) -> list[TeamMember]:
    rows = session.scalars(
        select(Employee)
        .where(Employee.is_public, Employee.is_active)
        .order_by(Employee.sort_order, Employee.id)
    )
    return [
        TeamMember(
            id=e.id,
            display_name=e.display_name,
            position=pick(e.position_i18n, locale),
            bio=pick(e.bio_i18n, locale),
            photo_url=e.photo_url,
            is_demo=e.is_demo,
        )
        for e in rows
    ]
