from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import LocaleQuery, SessionDep
from app.i18n import DEFAULT_LOCALE, pick
from app.modules.catalog.models import Service, ServiceCategory
from app.modules.media.models import GalleryImage, Review

router = APIRouter(prefix="/public", tags=["public"])


class GalleryItem(BaseModel):
    id: int
    kind: str
    category_slug: str | None
    service_slug: str | None
    image_url: str | None
    before_image_url: str | None
    width: int | None
    height: int | None
    alt: str
    caption: str | None
    is_demo: bool


class ReviewOut(BaseModel):
    id: int
    author_name: str
    vehicle: str | None
    rating: int | None
    body: str
    locale: str
    source: str
    source_url: str | None
    review_date: date
    is_demo: bool


@router.get("/gallery")
def list_gallery(
    session: SessionDep,
    locale: LocaleQuery = DEFAULT_LOCALE,
    category: str | None = None,
    service: str | None = None,
    kind: Literal["work", "before_after", "studio"] | None = None,
) -> list[GalleryItem]:
    query = (
        select(GalleryImage, ServiceCategory.slug, Service.slug)
        .outerjoin(ServiceCategory, GalleryImage.category_id == ServiceCategory.id)
        .outerjoin(Service, GalleryImage.service_id == Service.id)
        .where(GalleryImage.is_published)
        .order_by(GalleryImage.sort_order, GalleryImage.id)
    )
    if category:
        query = query.where(ServiceCategory.slug == category)
    if service:
        query = query.where(Service.slug == service)
    if kind:
        query = query.where(GalleryImage.kind == kind)
    return [
        GalleryItem(
            id=img.id,
            kind=img.kind,
            category_slug=cat_slug,
            service_slug=svc_slug,
            image_url=img.image_url,
            before_image_url=img.before_image_url,
            width=img.width,
            height=img.height,
            alt=pick(img.alt_i18n, locale),
            caption=pick(img.caption_i18n, locale),
            is_demo=img.is_demo,
        )
        for img, cat_slug, svc_slug in session.execute(query)
    ]


@router.get("/reviews")
def list_reviews(session: SessionDep) -> list[ReviewOut]:
    rows = session.scalars(
        select(Review)
        .where(Review.is_published)
        .order_by(Review.review_date.desc(), Review.id.desc())
        .limit(50)
    )
    return [ReviewOut.model_validate(r, from_attributes=True) for r in rows]
