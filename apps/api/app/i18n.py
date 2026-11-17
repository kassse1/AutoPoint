"""Content translations stored in DB as JSONB: {"ru": "...", "kk": "...", "en": "..."}."""

from typing import Annotated, Any, Literal

from pydantic import AfterValidator
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
