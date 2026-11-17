from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.i18n import ru_required


class GalleryImage(Base):
    __tablename__ = "gallery_images"
    __table_args__ = (
        CheckConstraint("kind IN ('work', 'before_after', 'studio')", name="kind"),
        # Only demo items may lack a photo (the site renders an illustration instead).
        CheckConstraint("image_url IS NOT NULL OR is_demo", name="image_or_demo"),
        CheckConstraint(
            "kind <> 'before_after' OR before_image_url IS NOT NULL OR is_demo",
            name="before_image_for_pairs",
        ),
        ru_required("alt_i18n"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_categories.id", ondelete="SET NULL"), index=True
    )
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), index=True
    )
    image_url: Mapped[str | None] = mapped_column(String(500))
    before_image_url: Mapped[str | None] = mapped_column(String(500))
    width: Mapped[int | None] = mapped_column(SmallInteger)
    height: Mapped[int | None] = mapped_column(SmallInteger)
    alt_i18n: Mapped[dict] = mapped_column(JSONB)
    caption_i18n: Mapped[dict | None] = mapped_column(JSONB)
    is_published: Mapped[bool] = mapped_column(server_default=text("false"))
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        CheckConstraint("locale IN ('ru', 'kk', 'en')", name="locale"),
        CheckConstraint("source IN ('manual', 'google', '2gis', 'yandex')", name="source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    author_name: Mapped[str] = mapped_column(String(100))
    vehicle: Mapped[str | None] = mapped_column(String(100))
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    body: Mapped[str] = mapped_column(String(2000))
    locale: Mapped[str] = mapped_column(String(2))
    source: Mapped[str] = mapped_column(String(20), server_default="manual")
    source_url: Mapped[str | None] = mapped_column(String(500))
    review_date: Mapped[date] = mapped_column(Date)
    is_published: Mapped[bool] = mapped_column(server_default=text("false"))
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
