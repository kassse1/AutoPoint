from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager

from app.deps import LocaleQuery, SessionDep
from app.errors import AppError
from app.i18n import DEFAULT_LOCALE, pick
from app.modules.catalog.models import (
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)

router = APIRouter(prefix="/public", tags=["public"])


class CategoryOut(BaseModel):
    slug: str
    name: str


class VehicleCategoryOut(BaseModel):
    code: str
    name: str
    examples: str | None


class ServiceCard(BaseModel):
    slug: str
    category_slug: str
    name: str
    summary: str
    image_url: str | None
    price_display: str
    price_from_kzt: int | None
    duration_min: int | None
    duration_max: int | None
    is_featured: bool
    addon_eligible: bool


class ProcessStep(BaseModel):
    title: str
    text: str


class VehiclePrice(BaseModel):
    vehicle_code: str
    price_kzt: int
    duration_min: int


class OptionOut(BaseModel):
    code: str
    name: str
    description: str | None
    group_code: str | None
    is_default: bool
    prices: list[VehiclePrice]


class ServiceDetail(ServiceCard):
    category_name: str
    description: str
    includes: list[str]
    benefits: list[str]
    process: list[ProcessStep]
    prices: list[VehiclePrice]
    options: list[OptionOut]
    related: list[ServiceCard]


def _active_services():
    return (
        select(Service)
        .join(Service.category)
        .where(Service.is_active, ServiceCategory.is_active)
        .options(contains_eager(Service.category))
        .order_by(ServiceCategory.sort_order, Service.sort_order, Service.id)
    )


def _price_stats(session: Session, service_ids: list[int]) -> dict[int, tuple[int, int, int]]:
    """service_id → (min base price, min duration, max duration) over active vehicle categories."""
    rows = session.execute(
        select(
            PriceEntry.service_id,
            func.min(PriceEntry.price_kzt),
            func.min(PriceEntry.duration_min),
            func.max(PriceEntry.duration_min),
        )
        .join(VehicleCategory)
        .where(
            PriceEntry.option_id.is_(None),
            VehicleCategory.is_active,
            PriceEntry.service_id.in_(service_ids),
        )
        .group_by(PriceEntry.service_id)
    )
    return {sid: (price, dmin, dmax) for sid, price, dmin, dmax in rows}


def _card(service: Service, stats: dict[int, tuple[int, int, int]], locale: str) -> ServiceCard:
    price, dmin, dmax = stats.get(service.id, (None, None, None))
    return ServiceCard(
        slug=service.slug,
        category_slug=service.category.slug,
        name=pick(service.name_i18n, locale),
        summary=pick(service.summary_i18n, locale),
        image_url=service.image_url,
        price_display=service.price_display,
        price_from_kzt=price,
        duration_min=dmin,
        duration_max=dmax,
        is_featured=service.is_featured,
        addon_eligible=service.addon_eligible,
    )


@router.get("/service-categories")
def list_categories(session: SessionDep, locale: LocaleQuery = DEFAULT_LOCALE) -> list[CategoryOut]:
    rows = session.scalars(
        select(ServiceCategory)
        .where(ServiceCategory.is_active)
        .order_by(ServiceCategory.sort_order, ServiceCategory.id)
    )
    return [CategoryOut(slug=c.slug, name=pick(c.name_i18n, locale)) for c in rows]


@router.get("/vehicle-categories")
def list_vehicle_categories(
    session: SessionDep, locale: LocaleQuery = DEFAULT_LOCALE
) -> list[VehicleCategoryOut]:
    rows = session.scalars(
        select(VehicleCategory)
        .where(VehicleCategory.is_active)
        .order_by(VehicleCategory.sort_order, VehicleCategory.id)
    )
    return [
        VehicleCategoryOut(
            code=v.code, name=pick(v.name_i18n, locale), examples=pick(v.examples_i18n, locale)
        )
        for v in rows
    ]


@router.get("/services")
def list_services(
    session: SessionDep,
    locale: LocaleQuery = DEFAULT_LOCALE,
    category: str | None = None,
    featured: bool | None = None,
) -> list[ServiceCard]:
    query = _active_services()
    if category:
        query = query.where(ServiceCategory.slug == category)
    if featured is not None:
        query = query.where(Service.is_featured == featured)
    services = list(session.scalars(query))
    stats = _price_stats(session, [s.id for s in services])
    return [_card(s, stats, locale) for s in services]


@router.get("/services/{slug}")
def get_service(
    slug: str, session: SessionDep, locale: LocaleQuery = DEFAULT_LOCALE
) -> ServiceDetail:
    service = session.scalars(_active_services().where(Service.slug == slug)).first()
    if service is None:
        raise AppError(404, "SERVICE_NOT_FOUND")

    entries = session.execute(
        select(PriceEntry, VehicleCategory.code)
        .join(VehicleCategory)
        .where(PriceEntry.service_id == service.id, VehicleCategory.is_active)
        .order_by(VehicleCategory.sort_order, VehicleCategory.id)
    ).all()
    by_option: dict[int | None, list[VehiclePrice]] = {}
    for entry, code in entries:
        by_option.setdefault(entry.option_id, []).append(
            VehiclePrice(
                vehicle_code=code, price_kzt=entry.price_kzt, duration_min=entry.duration_min
            )
        )

    options = session.scalars(
        select(ServiceOption)
        .where(ServiceOption.service_id == service.id, ServiceOption.is_active)
        .order_by(ServiceOption.sort_order, ServiceOption.id)
    )

    others = [s for s in session.scalars(_active_services()) if s.id != service.id]
    related = [s for s in others if s.category_id == service.category_id]
    related += [s for s in others if s.is_featured and s not in related]
    related = related[:3]

    stats = _price_stats(session, [service.id, *(s.id for s in related)])
    return ServiceDetail(
        **_card(service, stats, locale).model_dump(),
        category_name=pick(service.category.name_i18n, locale),
        description=pick(service.description_i18n, locale),
        includes=pick(service.includes_i18n, locale) or [],
        benefits=pick(service.benefits_i18n, locale) or [],
        process=pick(service.process_i18n, locale) or [],
        prices=by_option.get(None, []),
        options=[
            OptionOut(
                code=o.code,
                name=pick(o.name_i18n, locale),
                description=pick(o.description_i18n, locale),
                group_code=o.group_code,
                is_default=o.is_default,
                prices=by_option.get(o.id, []),
            )
            for o in options
        ],
        related=[_card(s, stats, locale) for s in related],
    )
