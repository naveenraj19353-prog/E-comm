"""GST calculation for orders.

The engine stores configuration rather than embedding a GST rate table in code;
merchants own product tax classification. Calculations use Decimal and the
result is snapshotted onto the order so a later rate change can never rewrite a
historical order.

Two deliberate departures from the reference implementation:

1. Product records are batch-loaded instead of one query per line (the reference
   does ``products.find_one`` inside the loop). Behaviour is identical: a product
   that cannot be found falls back to the store default rate.
2. ``state_code`` understands the two-letter abbreviations ("KA", "MH") that
   real delivery addresses actually contain. Genuinely unknown values still
   raise, which is the reference's intended fail-loud behaviour.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.database.mongo import products, tax_profiles

TWOPLACES = Decimal("0.01")

#: Two-digit GST state codes. Keys are lower-case names and common aliases.
GST_STATE_CODES = {
    "jammu and kashmir": "01",
    "himachal pradesh": "02",
    "punjab": "03",
    "chandigarh": "04",
    "uttarakhand": "05",
    "uttaranchal": "05",
    "haryana": "06",
    "delhi": "07",
    "new delhi": "07",
    "rajasthan": "08",
    "uttar pradesh": "09",
    "bihar": "10",
    "sikkim": "11",
    "arunachal pradesh": "12",
    "nagaland": "13",
    "manipur": "14",
    "mizoram": "15",
    "tripura": "16",
    "meghalaya": "17",
    "assam": "18",
    "west bengal": "19",
    "bengal": "19",
    "jharkhand": "20",
    "odisha": "21",
    "orissa": "21",
    "chhattisgarh": "22",
    "chattisgarh": "22",
    "madhya pradesh": "23",
    "gujarat": "24",
    "dadra and nagar haveli": "26",
    "daman and diu": "26",
    "dadra and nagar haveli and daman and diu": "26",
    "dnh": "26",
    "maharashtra": "27",
    "karnataka": "29",
    "goa": "30",
    "lakshadweep": "31",
    "kerala": "32",
    "tamil nadu": "33",
    "tamilnadu": "33",
    "puducherry": "34",
    "pondicherry": "34",
    "andaman and nicobar islands": "35",
    "andaman and nicobar": "35",
    "telangana": "36",
    "telengana": "36",
    "andhra pradesh": "37",
    "ladakh": "38",
    "other territory": "97",
    "centre jurisdiction": "99",
}

#: Standard postal abbreviations, which are unambiguous (state codes are numeric).
GST_STATE_ABBREVIATIONS = {
    "jk": "01", "hp": "02", "pb": "03", "ch": "04", "ua": "05", "uk": "05",
    "hr": "06", "dl": "07", "rj": "08", "up": "09", "br": "10", "sk": "11",
    "ar": "12", "nl": "13", "mn": "14", "mz": "15", "tr": "16", "ml": "17",
    "as": "18", "wb": "19", "jh": "20", "od": "21", "or": "21", "cg": "22",
    "mp": "23", "gj": "24", "dd": "26", "mh": "27", "ka": "29", "ga": "30",
    "ld": "31", "kl": "32", "tn": "33", "py": "34", "an": "35", "ts": "36",
    "tg": "36", "ap": "37", "la": "38",
}


def D(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def money(value: Decimal) -> Decimal:
    return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _float(value: Decimal) -> float:
    return float(money(value))


def state_code(state: str | None) -> str | None:
    """Resolve a state name, alias or code to a two-digit GST state code."""
    if not state:
        return None
    raw = str(state).strip()
    if not raw:
        return None
    if len(raw) == 2 and raw.isdigit():
        return raw
    key = " ".join(raw.lower().split())
    return (
        GST_STATE_CODES.get(key)
        or GST_STATE_CODES.get(key.replace("&", "and"))
        or GST_STATE_ABBREVIATIONS.get(key)
    )


def get_tax_profile(tenant_id: str) -> dict | None:
    return tax_profiles.find_one({"tenantId": str(tenant_id).strip().lower()})


def _taxable_from_gross(
    gross: Decimal, rate: Decimal, cess_rate: Decimal, inclusive: bool
) -> tuple[Decimal, Decimal, Decimal]:
    """Split a line amount into (taxable value, GST, cess).

    Cess is part of the inclusive divisor: for a tax-inclusive price the
    customer's money covers GST *and* cess, so dividing by GST alone would
    overstate the taxable value and understate both taxes.
    """
    if gross <= 0:
        return Decimal("0"), Decimal("0"), Decimal("0")
    if inclusive and (rate + cess_rate) > 0:
        taxable = gross / (Decimal("1") + (rate + cess_rate) / Decimal("100"))
    else:
        taxable = gross
    gst = taxable * rate / Decimal("100")
    cess = taxable * cess_rate / Decimal("100")
    return money(taxable), money(gst), money(cess)


def _allocate_discount(items: list[dict], discount: Decimal) -> list[Decimal]:
    """Spread an order-level discount across lines in proportion to value.

    The final line absorbs the rounding remainder, so the allocations always
    re-add to the discount exactly and tax is charged on what was really paid.
    """
    subtotals = [D(item.get("subtotal")) for item in items]
    total = sum(subtotals, Decimal("0"))
    if discount <= 0 or total <= 0:
        return [Decimal("0") for _ in items]
    discount = min(discount, total)
    allocations: list[Decimal] = []
    remaining = money(discount)
    for index, subtotal in enumerate(subtotals):
        if index == len(subtotals) - 1:
            share = remaining
        else:
            share = min(money(discount * subtotal / total), remaining)
        allocations.append(share)
        remaining -= share
    return allocations


def _load_product_tax_configs(tenant_id: str, items: list[dict]) -> dict[str, dict]:
    """One query for the whole cart instead of one per line."""
    object_ids = [to_object_id(item.get("productId")) for item in items]
    wanted = [oid for oid in object_ids if oid is not None]
    if not wanted:
        return {}
    found = products.find(
        {"_id": {"$in": wanted}, "tenantId": str(tenant_id).strip().lower()},
        {"tax": 1},
    )
    configs: dict[str, dict] = {}
    for document in found:
        configs[str(document["_id"])] = document.get("tax") or {}
    return configs


def calculate_order_tax(
    tenant_id: str,
    items: list[dict],
    *,
    discount: float = 0,
    shipping: float = 0,
    destination_state: str | None = None,
) -> dict:
    """Tax a cart. Raises ValueError when GST is on but the states cannot resolve."""
    profile = get_tax_profile(tenant_id)
    if not profile or not profile.get("enabled"):
        return {
            "enabled": False,
            "taxTotal": 0.0,
            "taxableTotal": round(
                max(
                    sum(float(i.get("subtotal") or 0) for i in items)
                    - float(discount or 0),
                    0,
                ),
                2,
            ),
            "cgst": 0.0,
            "sgst": 0.0,
            "igst": 0.0,
            "cess": 0.0,
            "lines": [],
            "shippingTax": None,
        }

    origin_code = str(profile.get("stateCode") or "").strip() or state_code(
        profile.get("state")
    )
    destination_code = state_code(destination_state)
    # Fail loudly rather than guessing: an invoice split against the wrong place
    # of supply collects the wrong tax, which is worse than a blocked checkout.
    if not origin_code:
        raise ValueError("Tax profile requires a valid supplier state/stateCode.")
    if not destination_code:
        raise ValueError("A valid delivery state is required for GST calculation.")

    interstate = origin_code != destination_code
    inclusive = bool(profile.get("priceIncludesTax", True))
    default_rate = D(profile.get("defaultTaxRate"))
    allocations = _allocate_discount(items, D(discount))
    configs = _load_product_tax_configs(tenant_id, items)

    lines = []
    totals = {
        "taxable": Decimal("0"),
        "cgst": Decimal("0"),
        "sgst": Decimal("0"),
        "igst": Decimal("0"),
        "cess": Decimal("0"),
    }
    for item, allocated_discount in zip(items, allocations):
        tax_cfg = configs.get(str(item.get("productId"))) or {}
        status = tax_cfg.get("taxStatus") or "taxable"
        rate = D(
            tax_cfg.get("taxRate")
            if tax_cfg.get("taxRate") is not None
            else default_rate
        )
        cess_rate = D(tax_cfg.get("cessRate"))
        if status in {"exempt", "nil_rated", "non_gst"}:
            rate = Decimal("0")
            cess_rate = Decimal("0")

        gross_after_discount = max(
            D(item.get("subtotal")) - allocated_discount, Decimal("0")
        )
        taxable, gst, cess = _taxable_from_gross(
            gross_after_discount, rate, cess_rate, inclusive
        )
        igst = gst if interstate else Decimal("0")
        cgst = Decimal("0") if interstate else money(gst / Decimal("2"))
        sgst = Decimal("0") if interstate else money(gst - cgst)

        lines.append(
            {
                "productId": str(item.get("productId")),
                "variantId": item.get("variantId"),
                "name": item.get("name"),
                "hsnSac": tax_cfg.get("hsnSac"),
                "taxStatus": status,
                "rate": float(rate),
                "cessRate": float(cess_rate),
                "discount": _float(allocated_discount),
                "taxableValue": _float(taxable),
                "cgst": _float(cgst),
                "sgst": _float(sgst),
                "igst": _float(igst),
                "cess": _float(cess),
                "quantity": int(item.get("quantity") or 0),
            }
        )
        totals["taxable"] += taxable
        totals["cgst"] += cgst
        totals["sgst"] += sgst
        totals["igst"] += igst
        totals["cess"] += cess

    shipping_line = None
    if D(shipping) > 0:
        rate = D(profile.get("shippingTaxRate"))
        taxable, gst, cess = _taxable_from_gross(
            D(shipping), rate, Decimal("0"), inclusive
        )
        igst = gst if interstate else Decimal("0")
        cgst = Decimal("0") if interstate else money(gst / Decimal("2"))
        sgst = Decimal("0") if interstate else money(gst - cgst)
        shipping_line = {
            "rate": float(rate),
            "taxableValue": _float(taxable),
            "cgst": _float(cgst),
            "sgst": _float(sgst),
            "igst": _float(igst),
            "cess": _float(cess),
        }
        totals["taxable"] += taxable
        totals["cgst"] += cgst
        totals["sgst"] += sgst
        totals["igst"] += igst

    tax_total = totals["cgst"] + totals["sgst"] + totals["igst"] + totals["cess"]
    return {
        "enabled": True,
        "priceIncludesTax": inclusive,
        "originStateCode": origin_code,
        "placeOfSupplyStateCode": destination_code,
        "interstate": interstate,
        "taxableTotal": _float(totals["taxable"]),
        "cgst": _float(totals["cgst"]),
        "sgst": _float(totals["sgst"]),
        "igst": _float(totals["igst"]),
        "cess": _float(totals["cess"]),
        "taxTotal": _float(tax_total),
        "lines": lines,
        "shippingTax": shipping_line,
    }


def total_from_tax_snapshot(
    subtotal: float, discount: float, shipping: float, tax: dict
) -> float:
    """The customer-facing payable for a tax snapshot.

    A tax-inclusive store's listed prices already contain GST, so the total is
    unchanged. An exclusive store has GST added on top.
    """
    base = D(subtotal) - D(discount) + D(shipping)
    if tax.get("enabled") and not tax.get("priceIncludesTax", True):
        base += D(tax.get("taxTotal"))
    return _float(max(base, Decimal("0")))


def to_object_id(value):
    from bson import ObjectId

    if isinstance(value, ObjectId):
        return value
    raw = str(value or "")
    return ObjectId(raw) if ObjectId.is_valid(raw) else None
