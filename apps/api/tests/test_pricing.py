"""Pricing engine unit tests (pure functions, no database)."""

from datetime import date

import pytest

from app.errors import AppError
from app.modules.pricing.engine import (
    DiscountData,
    OptionData,
    ServiceData,
    build_quote,
    price_line,
)

SEDAN, SUV = 1, 2
TODAY = date(2026, 11, 23)


def option(id, code, group=None, default=False, sedan=(0, 0), suv=(0, 0)):
    return OptionData(id, code, group, default, {"ru": code}, {SEDAN: sedan, SUV: suv})


CERAMIC = ServiceData(
    id=10,
    slug="ceramic",
    name_i18n={"ru": "Керамика"},
    addon_eligible=False,
    cells={SEDAN: (180_000, 480), SUV: (234_000, 575)},
    options={
        "one": option(1, "one", "layers", default=True),
        "two": option(2, "two", "layers", sedan=(60_000, 240), suv=(78_000, 290)),
        "wheels": option(3, "wheels", sedan=(40_000, 120), suv=(52_000, 145)),
    },
)
LIGHTS = ServiceData(11, "lights", {"ru": "Фары"}, True, {SEDAN: (25_000, 90), SUV: (32_000, 105)})
WASH = ServiceData(12, "wash", {"ru": "Мойка"}, True, {SEDAN: (25_000, 180)})  # no SUV price
INTERIOR = ServiceData(13, "interior", {"ru": "Салон"}, True, {SEDAN: (45_000, 240)})


def rule(id, kind, percent=None, amount=None, min_services=None, services=(), **dates):
    return DiscountData(
        id, kind, {"ru": f"r{id}"}, percent, amount, min_services, frozenset(services), **dates
    )


def test_base_price_with_default_group_option() -> None:
    line = price_line(CERAMIC, SEDAN, [], "primary")
    assert (line.price_kzt, line.duration_min) == (180_000, 480)
    assert [o.code for o in line.options] == ["one"]  # default of the unselected group


def test_chosen_options_add_price_and_time_and_replace_group_default() -> None:
    line = price_line(CERAMIC, SUV, ["two", "wheels"], "primary")
    assert line.price_kzt == 234_000 + 78_000 + 52_000
    assert line.duration_min == 575 + 290 + 145
    assert {o.code for o in line.options} == {"two", "wheels"}


@pytest.mark.parametrize(
    ("options", "code"),
    [
        (["one", "two"], "CONFLICTING_OPTIONS"),
        (["nope"], "UNKNOWN_OPTION"),
        (["wheels", "wheels"], "DUPLICATE_OPTION"),
    ],
)
def test_invalid_option_selections_are_rejected(options, code) -> None:
    with pytest.raises(AppError) as exc:
        price_line(CERAMIC, SEDAN, options, "primary")
    assert exc.value.code == code


def test_vehicle_without_price_is_rejected() -> None:
    with pytest.raises(AppError) as exc:
        build_quote(WASH, [], SUV, [], [], TODAY)
    assert exc.value.code == "VEHICLE_NOT_SUPPORTED"


def test_addons_are_summed_and_must_be_eligible() -> None:
    quote = build_quote(CERAMIC, [LIGHTS], SEDAN, [], [], TODAY)
    assert quote.subtotal_kzt == 205_000
    assert quote.duration_min == 570
    assert [line.role for line in quote.lines] == ["primary", "addon"]

    with pytest.raises(AppError) as exc:
        build_quote(LIGHTS, [CERAMIC], SEDAN, [], [], TODAY)
    assert exc.value.code == "ADDON_NOT_ALLOWED"
    with pytest.raises(AppError) as exc:
        build_quote(LIGHTS, [LIGHTS], SEDAN, [], [], TODAY)
    assert exc.value.code == "DUPLICATE_SERVICE"


def test_best_single_discount_wins_and_percent_rounds_down() -> None:
    rules = [
        rule(1, "bundle", percent=10, services={12, 13}),
        rule(2, "min_services", percent=5, min_services=3),
    ]
    quote = build_quote(WASH, [INTERIOR, LIGHTS], SEDAN, [], rules, TODAY)
    assert quote.subtotal_kzt == 95_000
    assert quote.discount.id == 1
    assert quote.discount_kzt == 9_500
    assert quote.total_kzt == 85_500

    odd = build_quote(
        WASH, [], SEDAN, [], [rule(3, "min_services", percent=33, min_services=1)], TODAY
    )
    assert odd.discount_kzt == 8_250  # 25 000 × 33 % = 8 250 exactly; floor never rounds up


def test_bundle_needs_all_its_services() -> None:
    rules = [rule(1, "bundle", percent=10, services={12, 13})]
    quote = build_quote(WASH, [LIGHTS], SEDAN, [], rules, TODAY)
    assert quote.discount is None and quote.total_kzt == quote.subtotal_kzt


def test_fixed_discount_never_exceeds_subtotal() -> None:
    quote = build_quote(
        LIGHTS, [], SEDAN, [], [rule(1, "min_services", amount=999_999, min_services=1)], TODAY
    )
    assert quote.discount_kzt == 25_000
    assert quote.total_kzt == 0


def test_discount_validity_window() -> None:
    expired = rule(1, "min_services", percent=10, min_services=1, valid_to=date(2026, 11, 22))
    future = rule(2, "min_services", percent=10, min_services=1, valid_from=date(2026, 11, 24))
    current = rule(3, "min_services", percent=5, min_services=1, valid_from=TODAY, valid_to=TODAY)
    quote = build_quote(LIGHTS, [], SEDAN, [], [expired, future, current], TODAY)
    assert quote.discount.id == 3
