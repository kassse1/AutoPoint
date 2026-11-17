"""Pricing rules as pure functions. The backend is the only place prices are computed;
any price sent by a client is ignored.

    line     = base(service, vehicle) + Σ option(service, option, vehicle)
    subtotal = line(primary) + Σ line(add-on)
    discount = the single best applicable active rule (never more than the subtotal)
    total    = subtotal − discount
"""

from dataclasses import dataclass, field
from datetime import date

from app.errors import AppError

Cell = tuple[int, int]  # (price_kzt, duration_min)


@dataclass(frozen=True)
class OptionData:
    id: int
    code: str
    group_code: str | None
    is_default: bool
    name_i18n: dict
    cells: dict[int, Cell]  # vehicle_category_id → cell


@dataclass(frozen=True)
class ServiceData:
    id: int
    slug: str
    name_i18n: dict
    addon_eligible: bool
    cells: dict[int, Cell]
    options: dict[str, OptionData] = field(default_factory=dict)


@dataclass(frozen=True)
class DiscountData:
    id: int
    kind: str  # "bundle" | "min_services"
    name_i18n: dict
    percent: int | None
    amount_kzt: int | None
    min_services: int | None
    service_ids: frozenset[int]
    valid_from: date | None = None
    valid_to: date | None = None


@dataclass(frozen=True)
class QuoteLine:
    service: ServiceData
    role: str  # "primary" | "addon"
    options: tuple[OptionData, ...]
    base_kzt: int
    price_kzt: int
    duration_min: int


@dataclass(frozen=True)
class Quote:
    lines: tuple[QuoteLine, ...]
    subtotal_kzt: int
    discount: DiscountData | None
    discount_kzt: int
    total_kzt: int
    duration_min: int


def _err(code: str, detail: str) -> AppError:
    return AppError(422, code, detail)


def price_line(
    service: ServiceData, vehicle_id: int, option_codes: list[str], role: str
) -> QuoteLine:
    if vehicle_id not in service.cells:
        raise _err("VEHICLE_NOT_SUPPORTED", f"{service.slug} has no price for this vehicle class")
    if len(set(option_codes)) != len(option_codes):
        raise _err("DUPLICATE_OPTION", "An option was selected twice")

    chosen: list[OptionData] = []
    groups: set[str] = set()
    for code in option_codes:
        option = service.options.get(code)
        if option is None:
            raise _err("UNKNOWN_OPTION", f"{code} is not an option of {service.slug}")
        if option.group_code:
            if option.group_code in groups:
                raise _err("CONFLICTING_OPTIONS", f"Only one option of group {option.group_code}")
            groups.add(option.group_code)
        chosen.append(option)
    # A group nobody chose falls back to its default (e.g. "1 layer").
    chosen += [o for o in service.options.values() if o.is_default and o.group_code not in groups]

    base_price, base_minutes = service.cells[vehicle_id]
    price, minutes = base_price, base_minutes
    for option in chosen:
        if vehicle_id not in option.cells:
            raise _err("VEHICLE_NOT_SUPPORTED", f"{option.code} has no price for this vehicle")
        price += option.cells[vehicle_id][0]
        minutes += option.cells[vehicle_id][1]
    return QuoteLine(service, role, tuple(chosen), base_price, price, minutes)


def discount_amount(rule: DiscountData, subtotal: int) -> int:
    raw = subtotal * rule.percent // 100 if rule.percent is not None else rule.amount_kzt or 0
    return min(raw, subtotal)


def applies(rule: DiscountData, service_ids: set[int], today: date) -> bool:
    if rule.valid_from and today < rule.valid_from:
        return False
    if rule.valid_to and today > rule.valid_to:
        return False
    if rule.kind == "bundle":
        return bool(rule.service_ids) and rule.service_ids <= service_ids
    return len(service_ids) >= (rule.min_services or 0)


def build_quote(
    primary: ServiceData,
    addons: list[ServiceData],
    vehicle_id: int,
    option_codes: list[str],
    rules: list[DiscountData],
    today: date,
) -> Quote:
    ids = [primary.id, *(a.id for a in addons)]
    if len(set(ids)) != len(ids):
        raise _err("DUPLICATE_SERVICE", "A service was selected twice")
    for addon in addons:
        if not addon.addon_eligible:
            raise _err("ADDON_NOT_ALLOWED", f"{addon.slug} can't be booked as an add-on")

    lines = (
        price_line(primary, vehicle_id, option_codes, "primary"),
        *(price_line(a, vehicle_id, [], "addon") for a in addons),
    )
    subtotal = sum(line.price_kzt for line in lines)
    best, best_amount = None, 0
    for rule in rules:
        if applies(rule, set(ids), today):
            amount = discount_amount(rule, subtotal)
            if amount > best_amount:
                best, best_amount = rule, amount
    return Quote(
        lines=lines,
        subtotal_kzt=subtotal,
        discount=best,
        discount_kzt=best_amount,
        total_kzt=subtotal - best_amount,
        duration_min=sum(line.duration_min for line in lines),
    )
