"""Loads pricing data from the database and turns a customer selection into a Quote."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.i18n import DEFAULT_LOCALE, Locale
from app.modules.catalog.models import (
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)
from app.modules.pricing.engine import (
    DiscountData,
    OptionData,
    Quote,
    ServiceData,
    build_quote,
)
from app.modules.pricing.models import DiscountRule

Code = Annotated[str, Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_-]+$")]


class Selection(BaseModel):
    """What the customer picked. Shared by quotes, availability and booking."""

    model_config = ConfigDict(extra="forbid")

    service: Code  # service slug
    vehicle: Code  # vehicle category code
    options: list[Code] = Field(default=[], max_length=10)
    addons: list[Code] = Field(default=[], max_length=5)  # add-on service slugs
    locale: Locale = DEFAULT_LOCALE


def load_services(session: Session, slugs: list[str]) -> dict[str, ServiceData]:
    services = session.scalars(
        select(Service)
        .join(ServiceCategory)
        .where(Service.slug.in_(slugs), Service.is_active, ServiceCategory.is_active)
    ).all()
    ids = [s.id for s in services]
    options = session.scalars(
        select(ServiceOption).where(ServiceOption.service_id.in_(ids), ServiceOption.is_active)
    ).all()
    entries = session.scalars(
        select(PriceEntry)
        .join(VehicleCategory)
        .where(PriceEntry.service_id.in_(ids), VehicleCategory.is_active)
    ).all()

    cells: dict[tuple[int, int | None], dict[int, tuple[int, int]]] = {}
    for e in entries:
        cells.setdefault((e.service_id, e.option_id), {})[e.vehicle_category_id] = (
            e.price_kzt,
            e.duration_min,
        )
    return {
        s.slug: ServiceData(
            id=s.id,
            slug=s.slug,
            name_i18n=s.name_i18n,
            addon_eligible=s.addon_eligible,
            cells=cells.get((s.id, None), {}),
            options={
                o.code: OptionData(
                    id=o.id,
                    code=o.code,
                    group_code=o.group_code,
                    is_default=o.is_default,
                    name_i18n=o.name_i18n,
                    cells=cells.get((s.id, o.id), {}),
                )
                for o in options
                if o.service_id == s.id
            },
        )
        for s in services
    }


def load_rules(session: Session) -> list[DiscountData]:
    return [
        DiscountData(
            id=r.id,
            kind=r.kind,
            name_i18n=r.name_i18n,
            percent=r.percent,
            amount_kzt=r.amount_kzt,
            min_services=r.min_services,
            service_ids=frozenset(s.service_id for s in r.services),
            valid_from=r.valid_from,
            valid_to=r.valid_to,
        )
        for r in session.scalars(select(DiscountRule).where(DiscountRule.is_active))
    ]


def vehicle_id_for(session: Session, code: str) -> int:
    vehicle_id = session.scalar(
        select(VehicleCategory.id).where(VehicleCategory.code == code, VehicleCategory.is_active)
    )
    if vehicle_id is None:
        raise AppError(422, "UNKNOWN_VEHICLE", f"Unknown vehicle category {code}")
    return vehicle_id


def quote_selection(session: Session, sel: Selection, today: date) -> tuple[Quote, int]:
    """Returns the quote and the vehicle category id."""
    services = load_services(session, [sel.service, *sel.addons])
    missing = [s for s in (sel.service, *sel.addons) if s not in services]
    if missing:
        raise AppError(422, "UNKNOWN_SERVICE", f"Unknown or inactive service: {missing[0]}")
    vehicle_id = vehicle_id_for(session, sel.vehicle)
    quote = build_quote(
        services[sel.service],
        [services[a] for a in sel.addons],
        vehicle_id,
        sel.options,
        load_rules(session),
        today,
    )
    return quote, vehicle_id
