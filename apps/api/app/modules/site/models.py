from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlalchemy import CheckConstraint, DateTime, SmallInteger, Time, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base
from app.errors import AppError
from app.i18n import I18nText, Locale


class BusinessSettings(Base):
    """Singleton row; `data` is validated by `SiteSettings` on every read and write."""

    __tablename__ = "business_settings"
    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BusinessHours(Base):
    """Weekly opening hours, local time in SiteSettings.timezone. No row = closed that day."""

    __tablename__ = "business_hours"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_range"),
        CheckConstraint("opens < closes", name="opens_before_closes"),
    )

    weekday: Mapped[int] = mapped_column(SmallInteger, primary_key=True)  # 1 = Monday
    opens: Mapped[time] = mapped_column(Time)
    closes: Mapped[time] = mapped_column(Time)


class MapLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["2gis", "yandex", "google"]
    url: HttpUrl


class SiteSettings(BaseModel):
    """Everything business-specific that is not marketing copy (that lives in messages/*.json)."""

    model_config = ConfigDict(extra="forbid")

    business_name: str = Field(min_length=1, max_length=100)
    # Demo installs show a visible notice that contacts, prices and reviews are examples.
    is_demo: bool = False
    phone: str = Field(pattern=r"^\+[1-9]\d{6,14}$")  # E.164
    whatsapp: str | None = Field(default=None, pattern=r"^\+[1-9]\d{6,14}$")
    telegram: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9_]{4,31}$")
    email: str | None = Field(default=None, max_length=200)
    instagram_url: HttpUrl | None = None
    address_i18n: I18nText
    city_i18n: I18nText
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    map_links: list[MapLink] = []
    seo_title_i18n: I18nText
    seo_description_i18n: I18nText
    accent_color: str = Field(default="#C3A46C", pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: str | None = None
    enabled_locales: list[Locale] = Field(default=["ru", "kk", "en"], min_length=1)
    timezone: str = "Asia/Almaty"
    currency: Literal["KZT"] = "KZT"
    booking: "BookingPolicy" = Field(default_factory=lambda: BookingPolicy())


class BookingPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot_step_min: int = Field(default=30, ge=5, le=240)  # grid of offered start times
    buffer_min: int = Field(default=30, ge=0, le=240)  # cleanup time blocked after each job
    lead_time_min: int = Field(default=120, ge=0, le=7 * 24 * 60)  # earliest start from now
    horizon_days: int = Field(default=60, ge=1, le=365)  # how far ahead customers can book
    cancel_cutoff_hours: int = Field(default=24, ge=0, le=14 * 24)  # self-cancel allowed until
    max_active_per_phone: int = Field(default=3, ge=1, le=20)  # anti slot-hoarding


def get_site_settings(session: Session) -> SiteSettings:
    row = session.get(BusinessSettings, 1)
    if row is None:
        raise AppError(503, "SITE_NOT_CONFIGURED", "Run the seed or configure settings")
    return SiteSettings.model_validate(row.data)
