"""Catalog management: categories, services, options, the price matrix, vehicle classes.

Changes reach the public site within the 60-second page cache.
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import SessionDep
from app.errors import AppError
from app.i18n import I18nList, I18nSteps, I18nText
from app.modules.audit.models import apply_changes, record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.catalog.models import (
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)

router = APIRouter(prefix="/admin", tags=["admin: catalog"])

Reader = Annotated[CurrentUser, Depends(require(Permission.STAFF_READ))]
Writer = Annotated[CurrentUser, Depends(require(Permission.CATALOG_WRITE))]
Slug = Annotated[str, Field(min_length=2, max_length=80, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Code = Annotated[str, Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_]+$")]
Kzt = Annotated[int, Field(ge=0, le=100_000_000)]
Minutes = Annotated[int, Field(ge=0, le=60 * 24 * 30)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


# --- schemas (Out = In + id; Patch = every field optional) --------------------------------


class CategoryIn(Strict):
    slug: Slug
    name_i18n: I18nText
    sort_order: int = 0
    is_active: bool = True


class AdminCategory(CategoryIn):
    id: int


class CategoryPatch(Strict):
    slug: Slug | None = None
    name_i18n: I18nText | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ServiceIn(Strict):
    category_id: int
    slug: Slug
    name_i18n: I18nText
    summary_i18n: I18nText
    description_i18n: I18nText
    includes_i18n: I18nList
    benefits_i18n: I18nList
    process_i18n: I18nSteps
    image_url: str | None = Field(default=None, max_length=500)
    price_display: Literal["fixed", "from"] = "from"
    addon_eligible: bool = False
    is_featured: bool = False
    is_active: bool = True
    sort_order: int = 0


class ServiceOut(ServiceIn):
    id: int


class ServicePatch(Strict):
    category_id: int | None = None
    slug: Slug | None = None
    name_i18n: I18nText | None = None
    summary_i18n: I18nText | None = None
    description_i18n: I18nText | None = None
    includes_i18n: I18nList | None = None
    benefits_i18n: I18nList | None = None
    process_i18n: I18nSteps | None = None
    image_url: str | None = Field(default=None, max_length=500)
    price_display: Literal["fixed", "from"] | None = None
    addon_eligible: bool | None = None
    is_featured: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class OptionIn(Strict):
    code: Code
    group_code: Code | None = None
    is_default: bool = False
    name_i18n: I18nText
    description_i18n: I18nText | None = None
    sort_order: int = 0
    is_active: bool = True


class AdminOption(OptionIn):
    id: int
    service_id: int


class OptionPatch(Strict):
    code: Code | None = None
    group_code: Code | None = None
    is_default: bool | None = None
    name_i18n: I18nText | None = None
    description_i18n: I18nText | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class PriceCell(Strict):
    option_code: Code | None = None  # None = the service's base price
    vehicle_code: Code
    price_kzt: Kzt
    duration_min: Minutes


class PriceMatrix(Strict):
    entries: list[PriceCell] = Field(max_length=500)


class VehicleIn(Strict):
    code: Code
    name_i18n: I18nText
    examples_i18n: I18nText | None = None
    sort_order: int = 0
    is_active: bool = True


class VehicleOut(VehicleIn):
    id: int


class VehiclePatch(Strict):
    name_i18n: I18nText | None = None
    examples_i18n: I18nText | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# --- helpers --------------------------------------------------------------------------------


def _get(session: Session, model: type, id_: int, code: str) -> Any:
    obj = session.get(model, id_)
    if obj is None:
        raise AppError(404, code)
    return obj


def _save(session: Session, what: str) -> None:
    """Commit, turning constraint violations (duplicate slug, bad reference…) into 409."""
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AppError(409, "CONFLICT", f"{what}: {error.orig.diag.message_primary}") from error


def _create(session: Session, user: CurrentUser, obj: Any, entity: str) -> Any:
    session.add(obj)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise AppError(409, "CONFLICT", f"{entity}: {error.orig.diag.message_primary}") from error
    record_user(session, user, f"{entity}.created", entity, obj.id)
    _save(session, entity)
    return obj


def _patch(session: Session, user: CurrentUser, obj: Any, body: BaseModel, entity: str) -> Any:
    before, after = apply_changes(obj, body.model_dump(exclude_unset=True, mode="json"))
    if after:
        record_user(session, user, f"{entity}.updated", entity, obj.id, before=before, after=after)
    _save(session, entity)
    return obj


def _delete_or_archive(session: Session, user: CurrentUser, obj: Any, entity: str) -> dict:
    """Delete if nothing references it; otherwise deactivate so history stays intact."""
    savepoint = session.begin_nested()
    try:
        session.delete(obj)
        session.flush()
    except IntegrityError:
        savepoint.rollback()
        obj.is_active = False
        record_user(session, user, f"{entity}.archived", entity, obj.id)
        _save(session, entity)
        return {"archived": True}
    savepoint.commit()
    record_user(session, user, f"{entity}.deleted", entity, obj.id)
    _save(session, entity)
    return {"archived": False}


# --- categories ---------------------------------------------------------------------------------


@router.get("/service-categories")
def list_categories(user: Reader, session: SessionDep) -> list[AdminCategory]:
    rows = session.scalars(select(ServiceCategory).order_by(ServiceCategory.sort_order))
    return [AdminCategory.model_validate(r) for r in rows]


@router.post("/service-categories", status_code=201)
def create_category(body: CategoryIn, user: Writer, session: SessionDep) -> AdminCategory:
    obj = _create(session, user, ServiceCategory(**body.model_dump()), "service_category")
    return AdminCategory.model_validate(obj)


@router.patch("/service-categories/{category_id}")
def update_category(
    category_id: int, body: CategoryPatch, user: Writer, session: SessionDep
) -> AdminCategory:
    obj = _get(session, ServiceCategory, category_id, "CATEGORY_NOT_FOUND")
    return AdminCategory.model_validate(_patch(session, user, obj, body, "service_category"))


@router.delete("/service-categories/{category_id}")
def delete_category(category_id: int, user: Writer, session: SessionDep) -> dict:
    obj = _get(session, ServiceCategory, category_id, "CATEGORY_NOT_FOUND")
    return _delete_or_archive(session, user, obj, "service_category")


# --- services -------------------------------------------------------------------------------------


@router.get("/services")
def list_services(user: Reader, session: SessionDep) -> list[ServiceOut]:
    rows = session.scalars(select(Service).order_by(Service.sort_order, Service.id))
    return [ServiceOut.model_validate(r) for r in rows]


@router.get("/services/{service_id}")
def get_service(service_id: int, user: Reader, session: SessionDep) -> ServiceOut:
    return ServiceOut.model_validate(_get(session, Service, service_id, "SERVICE_NOT_FOUND"))


@router.post("/services", status_code=201)
def create_service(body: ServiceIn, user: Writer, session: SessionDep) -> ServiceOut:
    obj = _create(session, user, Service(**body.model_dump(mode="json")), "service")
    return ServiceOut.model_validate(obj)


@router.patch("/services/{service_id}")
def update_service(
    service_id: int, body: ServicePatch, user: Writer, session: SessionDep
) -> ServiceOut:
    obj = _get(session, Service, service_id, "SERVICE_NOT_FOUND")
    return ServiceOut.model_validate(_patch(session, user, obj, body, "service"))


@router.delete("/services/{service_id}")
def delete_service(service_id: int, user: Writer, session: SessionDep) -> dict:
    obj = _get(session, Service, service_id, "SERVICE_NOT_FOUND")
    return _delete_or_archive(session, user, obj, "service")


# --- options --------------------------------------------------------------------------------------


def _single_default(session: Session, option: ServiceOption) -> None:
    """Within a group only one option may be the default."""
    if option.is_default and option.group_code:
        session.execute(
            update(ServiceOption)
            .where(
                ServiceOption.service_id == option.service_id,
                ServiceOption.group_code == option.group_code,
                ServiceOption.id != option.id,
            )
            .values(is_default=False)
        )


@router.get("/services/{service_id}/options")
def list_options(service_id: int, user: Reader, session: SessionDep) -> list[AdminOption]:
    rows = session.scalars(
        select(ServiceOption)
        .where(ServiceOption.service_id == service_id)
        .order_by(ServiceOption.sort_order, ServiceOption.id)
    )
    return [AdminOption.model_validate(r) for r in rows]


@router.post("/services/{service_id}/options", status_code=201)
def create_option(
    service_id: int, body: OptionIn, user: Writer, session: SessionDep
) -> AdminOption:
    _get(session, Service, service_id, "SERVICE_NOT_FOUND")
    obj = ServiceOption(service_id=service_id, **body.model_dump())
    session.add(obj)
    session.flush()
    _single_default(session, obj)
    return AdminOption.model_validate(_create(session, user, obj, "service_option"))


@router.patch("/options/{option_id}")
def update_option(
    option_id: int, body: OptionPatch, user: Writer, session: SessionDep
) -> AdminOption:
    obj = _get(session, ServiceOption, option_id, "OPTION_NOT_FOUND")
    before, after = apply_changes(obj, body.model_dump(exclude_unset=True, mode="json"))
    _single_default(session, obj)
    if after:
        record_user(
            session,
            user,
            "service_option.updated",
            "service_option",
            obj.id,
            before=before,
            after=after,
        )
    _save(session, "service_option")
    return AdminOption.model_validate(obj)


@router.delete("/options/{option_id}", status_code=204)
def delete_option(option_id: int, user: Writer, session: SessionDep) -> None:
    # Bookings keep a snapshot of their options, so deleting one never breaks history.
    obj = _get(session, ServiceOption, option_id, "OPTION_NOT_FOUND")
    session.delete(obj)
    record_user(
        session,
        user,
        "service_option.deleted",
        "service_option",
        option_id,
        before={"code": obj.code},
    )
    _save(session, "service_option")


# --- price matrix ---------------------------------------------------------------------------------


def _matrix(session: Session, service_id: int) -> PriceMatrix:
    options = {
        o.id: o.code
        for o in session.scalars(
            select(ServiceOption).where(ServiceOption.service_id == service_id)
        )
    }
    vehicles = {v.id: v.code for v in session.scalars(select(VehicleCategory))}
    entries = session.scalars(select(PriceEntry).where(PriceEntry.service_id == service_id))
    return PriceMatrix(
        entries=[
            PriceCell(
                option_code=options.get(e.option_id),
                vehicle_code=vehicles[e.vehicle_category_id],
                price_kzt=e.price_kzt,
                duration_min=e.duration_min,
            )
            for e in entries
        ]
    )


@router.get("/services/{service_id}/prices")
def get_prices(service_id: int, user: Reader, session: SessionDep) -> PriceMatrix:
    _get(session, Service, service_id, "SERVICE_NOT_FOUND")
    return _matrix(session, service_id)


@router.put("/services/{service_id}/prices")
def put_prices(
    service_id: int, body: PriceMatrix, user: Writer, session: SessionDep
) -> PriceMatrix:
    """Replaces the whole matrix of a service. Existing bookings keep their own price snapshot."""
    _get(session, Service, service_id, "SERVICE_NOT_FOUND")
    options = {
        o.code: o.id
        for o in session.scalars(
            select(ServiceOption).where(ServiceOption.service_id == service_id)
        )
    }
    vehicles = {v.code: v.id for v in session.scalars(select(VehicleCategory))}
    for cell in body.entries:
        if cell.vehicle_code not in vehicles:
            raise AppError(422, "UNKNOWN_VEHICLE", cell.vehicle_code)
        if cell.option_code is not None and cell.option_code not in options:
            raise AppError(422, "UNKNOWN_OPTION", cell.option_code)
        if cell.option_code is None and cell.duration_min == 0:
            raise AppError(422, "DURATION_REQUIRED", "A base price needs a duration")
    before = _matrix(session, service_id).model_dump()
    session.execute(delete(PriceEntry).where(PriceEntry.service_id == service_id))
    session.add_all(
        PriceEntry(
            service_id=service_id,
            option_id=options[c.option_code] if c.option_code else None,
            vehicle_category_id=vehicles[c.vehicle_code],
            price_kzt=c.price_kzt,
            duration_min=c.duration_min,
        )
        for c in body.entries
    )
    session.flush()
    record_user(
        session,
        user,
        "prices.replaced",
        "service",
        service_id,
        before=before,
        after=body.model_dump(),
    )
    _save(session, "prices")
    return _matrix(session, service_id)


# --- vehicle classes ------------------------------------------------------------------------------


@router.get("/vehicle-categories")
def list_vehicles(user: Reader, session: SessionDep) -> list[VehicleOut]:
    rows = session.scalars(select(VehicleCategory).order_by(VehicleCategory.sort_order))
    return [VehicleOut.model_validate(r) for r in rows]


@router.post("/vehicle-categories", status_code=201)
def create_vehicle(body: VehicleIn, user: Writer, session: SessionDep) -> VehicleOut:
    obj = _create(session, user, VehicleCategory(**body.model_dump()), "vehicle_category")
    return VehicleOut.model_validate(obj)


@router.patch("/vehicle-categories/{vehicle_id}")
def update_vehicle(
    vehicle_id: int, body: VehiclePatch, user: Writer, session: SessionDep
) -> VehicleOut:
    obj = _get(session, VehicleCategory, vehicle_id, "VEHICLE_NOT_FOUND")
    return VehicleOut.model_validate(_patch(session, user, obj, body, "vehicle_category"))
