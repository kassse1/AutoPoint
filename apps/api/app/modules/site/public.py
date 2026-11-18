from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import LocaleQuery, SessionDep
from app.i18n import DEFAULT_LOCALE, Locale, pick
from app.modules.site.models import BusinessHours, MapLink, get_site_settings

router = APIRouter(prefix="/public", tags=["public"])


class OpeningHours(BaseModel):
    weekday: int  # 1 = Monday
    opens: str  # "09:00", local time
    closes: str


class SiteOut(BaseModel):
    business_name: str
    is_demo: bool
    phone: str
    whatsapp: str | None
    telegram: str | None
    email: str | None
    instagram_url: str | None
    address: str
    city: str
    latitude: float
    longitude: float
    map_links: list[MapLink]
    seo_title: str
    seo_description: str
    accent_color: str
    logo_url: str | None
    hero_image_url: str | None
    enabled_locales: list[Locale]
    timezone: str
    currency: str
    hours: list[OpeningHours]


@router.get("/site")
def get_site(session: SessionDep, locale: LocaleQuery = DEFAULT_LOCALE) -> SiteOut:
    s = get_site_settings(session)
    hours = session.scalars(select(BusinessHours).order_by(BusinessHours.weekday))
    return SiteOut(
        business_name=s.business_name,
        is_demo=s.is_demo,
        phone=s.phone,
        whatsapp=s.whatsapp,
        telegram=s.telegram,
        email=s.email,
        instagram_url=str(s.instagram_url) if s.instagram_url else None,
        address=pick(s.address_i18n, locale),
        city=pick(s.city_i18n, locale),
        latitude=s.latitude,
        longitude=s.longitude,
        map_links=s.map_links,
        seo_title=pick(s.seo_title_i18n, locale),
        seo_description=pick(s.seo_description_i18n, locale),
        accent_color=s.accent_color,
        logo_url=s.logo_url,
        hero_image_url=s.hero_image_url,
        enabled_locales=s.enabled_locales,
        timezone=s.timezone,
        currency=s.currency,
        hours=[
            OpeningHours(
                weekday=h.weekday,
                opens=h.opens.strftime("%H:%M"),
                closes=h.closes.strftime("%H:%M"),
            )
            for h in hours
        ],
    )
