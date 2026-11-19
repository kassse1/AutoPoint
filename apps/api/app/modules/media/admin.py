"""Gallery and reviews management. Items created here are real (`is_demo` false); demo items
from the seed keep their flag and badge until staff replace or delete them."""

from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import SessionDep
from app.errors import AppError
from app.i18n import I18nText, Locale
from app.modules.audit.models import apply_changes, record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.media.models import GalleryImage, Review

router = APIRouter(prefix="/admin", tags=["admin: gallery & reviews"])

Writer = Annotated[CurrentUser, Depends(require(Permission.MEDIA_WRITE))]
# Our own uploads, or an https URL (e.g. a CDN the business already uses).
ImageUrl = Annotated[
    str, Field(max_length=500, pattern=r"^(/api/v1/media/[0-9a-f]{32}\.webp|https://\S+)$")
]


class GalleryIn(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    kind: Literal["work", "before_after", "studio"]
    category_id: int | None = None
    service_id: int | None = None
    image_url: ImageUrl
    before_image_url: ImageUrl | None = None
    width: int | None = Field(default=None, ge=1, le=10_000)
    height: int | None = Field(default=None, ge=1, le=10_000)
    alt_i18n: I18nText  # describes the photo for screen readers and search engines
    caption_i18n: I18nText | None = None
    is_published: bool = True
    sort_order: int = 0

    @model_validator(mode="after")
    def _pair(self) -> "GalleryIn":
        if self.kind == "before_after" and not self.before_image_url:
            raise ValueError("a before/after item needs both photos")
        return self


class GalleryOut(BaseModel):
    """Separate from GalleryIn on purpose: demo items (no photos yet) must still be listable."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    category_id: int | None
    service_id: int | None
    image_url: str | None
    before_image_url: str | None
    width: int | None
    height: int | None
    alt_i18n: dict
    caption_i18n: dict | None
    is_published: bool
    sort_order: int
    is_demo: bool


class AdminReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)
    author_name: str = Field(min_length=1, max_length=100)
    vehicle: str | None = Field(default=None, max_length=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    body: str = Field(min_length=5, max_length=2000)
    locale: Locale = "ru"
    source: Literal["manual", "google", "2gis", "yandex"] = "manual"
    source_url: str | None = Field(default=None, max_length=500, pattern=r"^https://\S+$")
    review_date: date
    is_published: bool = True


class AdminReview(AdminReviewIn):
    id: int
    is_demo: bool


def _get(session: Session, model: type, id_: int, code: str) -> Any:
    obj = session.get(model, id_)
    if obj is None:
        raise AppError(404, code)
    return obj


def _commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AppError(409, "CONFLICT", error.orig.diag.message_primary) from error


# --- gallery ----------------------------------------------------------------------------------


@router.get("/gallery")
def list_gallery(user: Writer, session: SessionDep) -> list[GalleryOut]:
    rows = session.scalars(select(GalleryImage).order_by(GalleryImage.sort_order, GalleryImage.id))
    return [GalleryOut.model_validate(r) for r in rows]


@router.post("/gallery", status_code=201)
def create_gallery(body: GalleryIn, user: Writer, session: SessionDep) -> GalleryOut:
    item = GalleryImage(**body.model_dump(), is_demo=False)
    session.add(item)
    session.flush()
    record_user(
        session, user, "gallery.created", "gallery_image", item.id, after={"kind": item.kind}
    )
    _commit(session)
    return GalleryOut.model_validate(item)


@router.put("/gallery/{item_id}")
def replace_gallery(item_id: int, body: GalleryIn, user: Writer, session: SessionDep) -> GalleryOut:
    item = _get(session, GalleryImage, item_id, "GALLERY_NOT_FOUND")
    # Giving a demo item a real photo makes it a real item.
    before, after = apply_changes(item, {**body.model_dump(), "is_demo": False})
    if after:
        record_user(
            session, user, "gallery.updated", "gallery_image", item.id, before=before, after=after
        )
    _commit(session)
    return GalleryOut.model_validate(item)


@router.delete("/gallery/{item_id}", status_code=204)
def delete_gallery(item_id: int, user: Writer, session: SessionDep) -> None:
    # shortcut: the image files stay on disk; add an orphan-file sweep if storage ever matters.
    item = _get(session, GalleryImage, item_id, "GALLERY_NOT_FOUND")
    session.delete(item)
    record_user(session, user, "gallery.deleted", "gallery_image", item_id)
    _commit(session)


# --- reviews ----------------------------------------------------------------------------------


@router.get("/reviews")
def list_reviews(user: Writer, session: SessionDep) -> list[AdminReview]:
    rows = session.scalars(select(Review).order_by(Review.review_date.desc(), Review.id.desc()))
    return [AdminReview.model_validate(r) for r in rows]


@router.post("/reviews", status_code=201)
def create_review(body: AdminReviewIn, user: Writer, session: SessionDep) -> AdminReview:
    review = Review(**body.model_dump(), is_demo=False)
    session.add(review)
    session.flush()
    record_user(session, user, "review.created", "review", review.id)
    _commit(session)
    return AdminReview.model_validate(review)


@router.put("/reviews/{review_id}")
def replace_review(
    review_id: int, body: AdminReviewIn, user: Writer, session: SessionDep
) -> AdminReview:
    review = _get(session, Review, review_id, "REVIEW_NOT_FOUND")
    if review.is_demo:
        # A demo text must never be turned into a "real" customer review.
        raise AppError(409, "DEMO_REVIEW", "Delete demo reviews and add real ones instead")
    before, after = apply_changes(review, body.model_dump())
    if after:
        record_user(
            session, user, "review.updated", "review", review.id, before=before, after=after
        )
    _commit(session)
    return AdminReview.model_validate(review)


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(review_id: int, user: Writer, session: SessionDep) -> None:
    review = _get(session, Review, review_id, "REVIEW_NOT_FOUND")
    session.delete(review)
    record_user(session, user, "review.deleted", "review", review_id)
    _commit(session)
