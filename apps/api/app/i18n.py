"""Content translations stored in DB as JSONB: {"ru": "...", "kk": "...", "en": "..."}."""

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import CheckConstraint

Locale = Literal["ru", "kk", "en"]
DEFAULT_LOCALE: Locale = "ru"


def pick[T](values: dict[str, T] | None, locale: str) -> T | None:
    """Value for `locale`, falling back to the default locale."""
    if not values:
        return None
    value = values.get(locale)
    return value if value not in (None, "", []) else values.get(DEFAULT_LOCALE)


def _require_default(value: dict[str, Any]) -> dict[str, Any]:
    if not value.get(DEFAULT_LOCALE):
        raise ValueError(f"'{DEFAULT_LOCALE}' translation is required")
    return value


I18nText = Annotated[dict[Locale, str], AfterValidator(_require_default)]


def ru_required(column: str) -> CheckConstraint:
    """DB-level guarantee that the default-locale value exists."""
    return CheckConstraint(f"{column} ? 'ru'", name=f"{column}_has_ru")


class Step(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=500)


I18nList = Annotated[dict[Locale, list[str]], AfterValidator(_require_default)]
I18nSteps = Annotated[dict[Locale, list[Step]], AfterValidator(_require_default)]
