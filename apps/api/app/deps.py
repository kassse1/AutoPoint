from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.db import get_session
from app.i18n import Locale

SessionDep = Annotated[Session, Depends(get_session)]
LocaleQuery = Annotated[Locale, Query(description="Content language; falls back to ru")]
