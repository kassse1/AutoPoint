"""Public read API against the demo seed (real PostgreSQL, rolled back per test)."""

import pytest
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.i18n import pick
from app.modules.catalog.models import (
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)
from app.modules.media.models import GalleryImage, Review
from app.modules.site.models import SiteSettings
from app.modules.staff.models import Employee

V1 = "/api/v1/public"


def test_pick_falls_back_to_default_locale() -> None:
    assert pick({"ru": "Полировка", "en": "Polish"}, "en") == "Polish"
    assert pick({"ru": "Полировка", "kk": ""}, "kk") == "Полировка"
    assert pick({"ru": ["a"], "kk": []}, "kk") == ["a"]
    assert pick(None, "ru") is None


def test_site_settings_validation_rejects_bad_values() -> None:
    from app.seed import SITE

    data = SITE.model_dump(mode="json")
    with pytest.raises(ValidationError):
        SiteSettings.model_validate({**data, "phone": "8 700 000 00 00"})
    with pytest.raises(ValidationError):
        SiteSettings.model_validate({**data, "address_i18n": {"en": "Only English"}})
    with pytest.raises(ValidationError):
        SiteSettings.model_validate({**data, "unexpected": True})


def test_site_is_localized_and_flags_demo(api) -> None:
    body = api.get(f"{V1}/site", params={"locale": "kk"}).json()
    assert body["business_name"] == "AutoPoint"
    assert body["is_demo"] is True
    assert body["city"] == "Астана"
    assert body["currency"] == "KZT"
    assert body["timezone"] == "Asia/Almaty"
    assert [h["weekday"] for h in body["hours"]] == [1, 2, 3, 4, 5, 6, 7]
    assert body["hours"][0] == {"weekday": 1, "opens": "09:00", "closes": "20:00"}


def test_site_without_settings_is_503(db_session) -> None:
    from fastapi.testclient import TestClient

    from app.db import get_session
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = lambda: db_session
    res = TestClient(app).get(f"{V1}/site")
    assert res.status_code == 503
    assert res.json()["code"] == "SITE_NOT_CONFIGURED"


def test_unknown_locale_is_rejected(api) -> None:
    res = api.get(f"{V1}/services", params={"locale": "fr"})
    assert res.status_code == 422
    assert res.json()["errors"][0]["field"] == "locale"


def test_services_list_has_price_from_and_filters(api) -> None:
    services = api.get(f"{V1}/services", params={"locale": "en"}).json()
    assert len(services) == 8
    ceramic = next(s for s in services if s["slug"] == "ceramic-coating")
    assert ceramic["name"] == "Ceramic coating"
    # Seed: sedan 180 000, compact factor 0.85 → 153 000 is the minimum.
    assert ceramic["price_from_kzt"] == 153_000

    featured = api.get(f"{V1}/services", params={"featured": True}).json()
    assert {s["slug"] for s in featured} == {
        "paint-correction",
        "ceramic-coating",
        "ppf",
        "interior-detailing",
    }
    interior = api.get(f"{V1}/services", params={"category": "interior"}).json()
    assert {s["category_slug"] for s in interior} == {"interior"}


def test_price_from_ignores_inactive_vehicle_categories(api, seeded) -> None:
    seeded.execute(
        update(VehicleCategory).where(VehicleCategory.code == "compact").values(is_active=False)
    )
    services = api.get(f"{V1}/services").json()
    ceramic = next(s for s in services if s["slug"] == "ceramic-coating")
    assert ceramic["price_from_kzt"] == 180_000  # sedan is now the cheapest
    vehicles = api.get(f"{V1}/vehicle-categories").json()
    assert "compact" not in {v["code"] for v in vehicles}


def test_inactive_service_or_category_is_hidden(api, seeded) -> None:
    seeded.execute(update(Service).where(Service.slug == "ppf").values(is_active=False))
    seeded.execute(
        update(ServiceCategory).where(ServiceCategory.slug == "interior").values(is_active=False)
    )
    slugs = {s["slug"] for s in api.get(f"{V1}/services").json()}
    assert "ppf" not in slugs
    assert "interior-detailing" not in slugs
    assert api.get(f"{V1}/services/ppf").status_code == 404
    assert api.get(f"{V1}/services/interior-detailing").json()["code"] == "SERVICE_NOT_FOUND"


def test_service_detail_has_price_matrix_options_and_related(api) -> None:
    body = api.get(f"{V1}/services/ceramic-coating", params={"locale": "ru"}).json()
    assert body["category_name"] == "Защита кузова"
    assert [p["vehicle_code"] for p in body["prices"]] == [
        "compact",
        "sedan",
        "crossover",
        "suv",
        "large_suv",
    ]
    assert body["prices"][1] == {"vehicle_code": "sedan", "price_kzt": 180_000, "duration_min": 480}
    layers = [o for o in body["options"] if o["group_code"] == "layers"]
    assert [o["code"] for o in layers] == ["one_layer", "two_layers", "three_layers"]
    assert [o["is_default"] for o in layers] == [True, False, False]
    assert len(layers[1]["prices"]) == 5
    assert len(body["includes"]) == 5
    assert body["process"][0]["title"] == "Подготовка"
    related = [r["slug"] for r in body["related"]]
    assert "ceramic-coating" not in related
    assert related[0] == "ppf"  # same category first
    assert len(related) <= 3


def test_gallery_hides_unpublished_and_filters_kind(api, seeded) -> None:
    pairs = api.get(f"{V1}/gallery", params={"kind": "before_after"}).json()
    assert len(pairs) == 3
    assert all(p["is_demo"] and p["image_url"] is None for p in pairs)

    seeded.execute(update(GalleryImage).values(is_published=False))
    assert api.get(f"{V1}/gallery").json() == []


def test_gallery_filters_by_service(api) -> None:
    items = api.get(f"{V1}/gallery", params={"service": "ppf"}).json()
    assert [i["service_slug"] for i in items] == ["ppf"]


def test_reviews_and_team_expose_demo_flag_and_hide_unpublished(api, seeded) -> None:
    reviews = api.get(f"{V1}/reviews").json()
    assert len(reviews) == 3 and all(r["is_demo"] for r in reviews)
    team = api.get(f"{V1}/team").json()
    assert len(team) == 3 and all(m["is_demo"] for m in team)
    assert set(team[0]) == {"id", "display_name", "position", "bio", "photo_url", "is_demo"}

    seeded.execute(update(Review).values(is_published=False))
    seeded.execute(update(Employee).values(is_public=False))
    assert api.get(f"{V1}/reviews").json() == []
    assert api.get(f"{V1}/team").json() == []


# --- database constraints -------------------------------------------------------------


def _expect_integrity_error(session, obj) -> None:
    session.add(obj)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_negative_price_is_rejected(seeded) -> None:
    entry = seeded.scalars(select(PriceEntry)).first()
    _expect_integrity_error(
        seeded,
        PriceEntry(
            service_id=entry.service_id,
            option_id=None,
            vehicle_category_id=entry.vehicle_category_id,
            price_kzt=-1,
            duration_min=60,
        ),
    )


def test_duplicate_price_cell_is_rejected(seeded) -> None:
    entry = seeded.scalars(select(PriceEntry).where(PriceEntry.option_id.is_(None))).first()
    _expect_integrity_error(
        seeded,
        PriceEntry(
            service_id=entry.service_id,
            option_id=None,  # NULLS NOT DISTINCT makes base prices unique too
            vehicle_category_id=entry.vehicle_category_id,
            price_kzt=1,
            duration_min=60,
        ),
    )


def test_option_must_belong_to_the_priced_service(seeded) -> None:
    ppf = seeded.scalars(select(Service).where(Service.slug == "ppf")).one()
    foreign_option = seeded.scalars(
        select(ServiceOption).where(ServiceOption.service_id != ppf.id)
    ).first()
    vehicle = seeded.scalars(select(VehicleCategory)).first()
    _expect_integrity_error(
        seeded,
        PriceEntry(
            service_id=ppf.id,
            option_id=foreign_option.id,
            vehicle_category_id=vehicle.id,
            price_kzt=1000,
            duration_min=0,
        ),
    )


def test_translations_require_russian(seeded) -> None:
    _expect_integrity_error(seeded, ServiceCategory(slug="wheels", name_i18n={"en": "Wheels"}))


def test_real_gallery_item_requires_a_photo(seeded) -> None:
    _expect_integrity_error(
        seeded, GalleryImage(kind="work", alt_i18n={"ru": "Фото"}, is_demo=False)
    )
