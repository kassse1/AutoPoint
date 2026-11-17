from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import SessionDep
from app.errors import AppError
from app.i18n import I18nText
from app.modules.audit.models import record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.catalog.models import Service
from app.modules.pricing.models import DiscountRule, DiscountRuleService

router = APIRouter(prefix="/admin/discount-rules", tags=["admin: pricing"])

Reader = Annotated[CurrentUser, Depends(require(Permission.STAFF_READ))]
Writer = Annotated[CurrentUser, Depends(require(Permission.CATALOG_WRITE))]


class DiscountRuleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["bundle", "min_services"]
    name_i18n: I18nText
    percent: int | None = Field(default=None, ge=1, le=90)
    amount_kzt: int | None = Field(default=None, ge=1, le=100_000_000)
    min_services: int | None = Field(default=None, ge=2, le=10)
    service_slugs: list[str] = Field(default=[], max_length=10)  # for "bundle"
    valid_from: date | None = None
    valid_to: date | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _consistent(self) -> "DiscountRuleIn":
        if (self.percent is None) == (self.amount_kzt is None):
            raise ValueError("set exactly one of percent or amount_kzt")
        if self.kind == "bundle" and len(set(self.service_slugs)) < 2:
            raise ValueError("a bundle needs at least two services")
        if self.kind == "min_services" and self.min_services is None:
            raise ValueError("min_services is required")
        if self.valid_from and self.valid_to and self.valid_from > self.valid_to:
            raise ValueError("valid_from is after valid_to")
        return self


class DiscountRuleOut(DiscountRuleIn):
    id: int


def _out(session: Session, rule: DiscountRule) -> DiscountRuleOut:
    slugs = session.scalars(
        select(Service.slug).where(Service.id.in_([s.service_id for s in rule.services]))
    ).all()
    return DiscountRuleOut(
        id=rule.id,
        kind=rule.kind,
        name_i18n=rule.name_i18n,
        percent=rule.percent,
        amount_kzt=rule.amount_kzt,
        min_services=rule.min_services,
        service_slugs=sorted(slugs),
        valid_from=rule.valid_from,
        valid_to=rule.valid_to,
        is_active=rule.is_active,
    )


def _apply(session: Session, rule: DiscountRule, body: DiscountRuleIn) -> None:
    ids = dict(
        session.execute(
            select(Service.slug, Service.id).where(Service.slug.in_(body.service_slugs))
        ).all()
    )
    missing = set(body.service_slugs) - ids.keys()
    if missing:
        raise AppError(422, "UNKNOWN_SERVICE", ", ".join(sorted(missing)))
    for field in (
        "kind",
        "name_i18n",
        "percent",
        "amount_kzt",
        "min_services",
        "valid_from",
        "valid_to",
        "is_active",
    ):
        setattr(rule, field, getattr(body, field))
    rule.services = [DiscountRuleService(service_id=i) for i in ids.values()]


@router.get("")
def list_rules(user: Reader, session: SessionDep) -> list[DiscountRuleOut]:
    return [
        _out(session, r) for r in session.scalars(select(DiscountRule).order_by(DiscountRule.id))
    ]


@router.post("", status_code=201)
def create_rule(body: DiscountRuleIn, user: Writer, session: SessionDep) -> DiscountRuleOut:
    rule = DiscountRule()
    _apply(session, rule, body)
    session.add(rule)
    session.flush()
    record_user(
        session,
        user,
        "discount.created",
        "discount_rule",
        rule.id,
        after=body.model_dump(mode="json"),
    )
    session.commit()
    return _out(session, rule)


@router.put("/{rule_id}")
def replace_rule(
    rule_id: int, body: DiscountRuleIn, user: Writer, session: SessionDep
) -> DiscountRuleOut:
    rule = session.get(DiscountRule, rule_id)
    if rule is None:
        raise AppError(404, "DISCOUNT_NOT_FOUND")
    before = _out(session, rule).model_dump(mode="json")
    _apply(session, rule, body)
    session.flush()
    record_user(
        session,
        user,
        "discount.updated",
        "discount_rule",
        rule.id,
        before=before,
        after=body.model_dump(mode="json"),
    )
    session.commit()
    return _out(session, rule)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, user: Writer, session: SessionDep) -> None:
    rule = session.get(DiscountRule, rule_id)
    if rule is None:
        raise AppError(404, "DISCOUNT_NOT_FOUND")
    # Bookings keep the discount name and amount as a snapshot; their FK is SET NULL.
    session.delete(rule)
    record_user(session, user, "discount.deleted", "discount_rule", rule_id)
    session.commit()
