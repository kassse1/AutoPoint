from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.i18n import Locale

SessionDep = Annotated[Session, Depends(get_session)]
LocaleQuery = Annotated[Locale, Query(description="Content language; falls back to ru")]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


PageQuery = Annotated[int, Query(ge=1, le=10_000)]
PageSizeQuery = Annotated[int, Query(ge=1, le=200)]


def paginate(session: Session, query: Select, page: int, page_size: int) -> tuple[list, int]:
    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = session.scalars(query.limit(page_size).offset((page - 1) * page_size)).all()
    return list(rows), total
