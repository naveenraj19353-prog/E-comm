"""GST calculation for store checkouts.

Single source of truth: checkout totals, order writes and invoices must all ask
this module, never re-derive tax inline. Deliberately dependency-free (stdlib
only) so it can be unit-tested without FastAPI, pymongo or a database.

Two pricing bases are supported, chosen per store:

* inclusive (``pricesIncludeTax=True``) — the listed price already contains GST,
  so tax is *derived* and the customer pays the listed price. ``taxable`` is
  ``net / (1 + rate)``. This keeps the storefront payable unchanged.
* exclusive (``pricesIncludeTax=False``) — tax is added on top of the listed
  price, so the payable grows by the tax amount.

Under GST the split depends on place of supply: same state as the seller gives
CGST + SGST (half the rate each), a different state gives IGST at the full rate.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Optional, Sequence

# Statutory slabs. 0% covers exempt and nil-rated goods, which is also what a
# composition-scheme dealer charges on everything.
GST_RATES = (0.0, 0.5, 3.0, 5.0, 12.0, 18.0, 28.0)

# GST state codes are the first two digits of a GSTIN, so codes are kept as
# zero-padded strings ("01".."38", plus "97"/"99") to match a GSTIN slice directly.
STATE_CODES: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

# Buyer state arrives as free text from the address form, so spelling variants
# have to land on the same code. A missed alias would silently turn an
# intra-state supply into IGST, which is why this is tested explicitly.
_STATE_ALIASES: dict[str, str] = {
    "jammu and kashmir": "01",
    "jammu & kashmir": "01",
    "j&k": "01",
    "jk": "01",
    "himachal pradesh": "02",
    "hp": "02",
    "punjab": "03",
    "pb": "03",
    "chandigarh": "04",
    "ch": "04",
    "uttarakhand": "05",
    "uttaranchal": "05",
    "uk": "05",
    "haryana": "06",
    "hr": "06",
    "delhi": "07",
    "new delhi": "07",
    "nct of delhi": "07",
    "nct": "07",
    "dl": "07",
    "rajasthan": "08",
    "rj": "08",
    "uttar pradesh": "09",
    "up": "09",
    "bihar": "10",
    "br": "10",
    "sikkim": "11",
    "sk": "11",
    "arunachal pradesh": "12",
    "ar": "12",
    "nagaland": "13",
    "nl": "13",
    "manipur": "14",
    "mn": "14",
    "mizoram": "15",
    "mz": "15",
    "tripura": "16",
    "tr": "16",
    "meghalaya": "17",
    "ml": "17",
    "assam": "18",
    "as": "18",
    "west bengal": "19",
    "bengal": "19",
    "wb": "19",
    "jharkhand": "20",
    "jh": "20",
    "odisha": "21",
    "orissa": "21",
    "od": "21",
    "or": "21",
    "chhattisgarh": "22",
    "chattisgarh": "22",
    "cg": "22",
    "madhya pradesh": "23",
    "mp": "23",
    "gujarat": "24",
    "gj": "24",
    "dadra and nagar haveli": "26",
    "daman and diu": "26",
    "dadra and nagar haveli and daman and diu": "26",
    "dnh": "26",
    "dd": "26",
    "maharashtra": "27",
    "mh": "27",
    "karnataka": "29",
    "ka": "29",
    "goa": "30",
    "ga": "30",
    "lakshadweep": "31",
    "ld": "31",
    "kerala": "32",
    "kl": "32",
    "tamil nadu": "33",
    "tamilnadu": "33",
    "tn": "33",
    "puducherry": "34",
    "pondicherry": "34",
    "py": "34",
    "andaman and nicobar islands": "35",
    "andaman and nicobar": "35",
    "andaman & nicobar islands": "35",
    "an": "35",
    "telangana": "36",
    "telengana": "36",
    "tg": "36",
    "andhra pradesh": "37",
    "ap": "37",
    "ladakh": "38",
    "la": "38",
    "other territory": "97",
    "centre jurisdiction": "99",
}


def round_money(value: float) -> float:
    """Round to 2 dp, half away from zero.

    Python's built-in round() is banker's rounding, so round(2.675, 2) and
    friends quote a different paise than a tax invoice expects.
    """
    if value is None:
        return 0.0
    scaled = float(value) * 100
    if scaled >= 0:
        return math.floor(scaled + 0.5) / 100
    return -math.floor(-scaled + 0.5) / 100


def round_to_rupee(value: float) -> int:
    """Nearest whole rupee, half away from zero (invoice round-off)."""
    if value is None:
        return 0
    if value >= 0:
        return int(math.floor(float(value) + 0.5))
    return -int(math.floor(-float(value) + 0.5))


def state_code_from_gstin(gstin: Optional[str]) -> Optional[str]:
    """First two digits of a GSTIN are its state code."""
    if not gstin:
        return None
    digits = str(gstin).strip()[:2]
    return digits if digits in STATE_CODES else None


def state_code_for(value: Optional[str]) -> Optional[str]:
    """Normalise a state name, alias or code to a two-digit GST state code."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.isdigit():
        padded = raw.zfill(2)
        return padded if padded in STATE_CODES else None
    return _STATE_ALIASES.get(raw.lower().replace(".", "").strip())


def is_valid_gst_rate(rate: Any) -> bool:
    try:
        return round_money(float(rate)) in GST_RATES
    except (TypeError, ValueError):
        return False


# HSN codes are 4, 6 or 8 digits. SAC codes (services) use the same shape.
_HSN_PATTERN = re.compile(r"^\d{4}(\d{2})?(\d{2})?$")


def normalize_hsn(value: Any) -> Optional[str]:
    """Blank becomes None; anything that is not 4/6/8 digits is rejected."""
    if value is None:
        return None
    code = str(value).strip()
    if not code:
        return None
    if not _HSN_PATTERN.match(code):
        raise ValueError("hsnCode must be 4, 6 or 8 digits")
    return code


def normalize_gst_rate(value: Any) -> Optional[float]:
    """Blank becomes None; a rate outside the statutory slabs is rejected.

    Rejecting rather than clamping matters: silently turning 7 into 5 or 12 would
    mis-state a tax invoice.
    """
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        numeric = round_money(float(value))
    except (TypeError, ValueError):
        raise ValueError("gstRate must be a number") from None
    if numeric not in GST_RATES:
        slabs = ", ".join(f"{rate:g}" for rate in GST_RATES)
        raise ValueError(f"gstRate must be one of: {slabs}")
    return numeric


def resolve_gst_rate(
    *,
    product_rate: Any = None,
    category_rate: Any = None,
    policy: Optional[TaxPolicy] = None,
) -> float:
    """Rate for a line: the product's own, else its category's, else the store default.

    Only ``None`` counts as "unset". An explicit ``0`` on a product is a real
    choice — exempt or nil-rated goods — and must NOT fall through to the
    category or store default, or those goods would start being taxed.

    A composition-scheme store charges nothing regardless of what is configured.
    """
    if policy is not None and policy.composition:
        return 0.0

    fallbacks = (
        product_rate,
        category_rate,
        None if policy is None else policy.default_gst_rate,
    )
    for candidate in fallbacks:
        if candidate is None or (isinstance(candidate, str) and not candidate.strip()):
            continue
        try:
            value = round_money(float(candidate))
        except (TypeError, ValueError):
            continue
        if value in GST_RATES:
            return value
    return 0.0


@dataclass(frozen=True)
class TaxPolicy:
    """How a given store prices and charges tax."""

    inclusive: bool = True
    # A composition dealer may not collect tax or pass on credit.
    composition: bool = False
    freight_taxable: bool = True
    round_to_rupee_on_invoice: bool = True
    seller_state_code: Optional[str] = None
    default_gst_rate: float = 0.0

    @classmethod
    def from_tenant(cls, tenant: Optional[Mapping[str, Any]]) -> "TaxPolicy":
        """Build a policy from a tenant document.

        Defaults are deliberately inert: nothing is taxed until a store sets a
        rate, so shipping this module cannot change anyone's payable.
        """
        tenant = tenant or {}
        settings = tenant.get("tax") or {}
        business = tenant.get("businessDetails") or {}

        seller = state_code_for(settings.get("stateCode")) or state_code_from_gstin(
            business.get("gstin")
        )
        if seller is None:
            seller = state_code_for(business.get("state"))

        try:
            default_rate = float(settings.get("defaultGstRate") or 0.0)
        except (TypeError, ValueError):
            default_rate = 0.0

        return cls(
            inclusive=bool(settings.get("pricesIncludeTax", True)),
            composition=bool(settings.get("compositionScheme", False)),
            freight_taxable=bool(settings.get("freightTaxable", True)),
            round_to_rupee_on_invoice=bool(
                settings.get("roundInvoiceToRupee", True)
            ),
            seller_state_code=seller,
            default_gst_rate=default_rate if is_valid_gst_rate(default_rate) else 0.0,
        )


@dataclass
class TaxableLine:
    """One cart line, after any discount attributable to that line."""

    quantity: float
    unit_price: float
    gst_rate: float = 0.0
    hsn_code: Optional[str] = None
    # Absolute discount for this line (not a percentage).
    discount: float = 0.0
    cess_rate: float = 0.0
    name: str = ""


@dataclass
class TaxedLine:
    name: str
    quantity: float
    unit_price: float
    hsn_code: Optional[str]
    gst_rate: float
    gross: float
    discount: float
    net: float
    taxable_value: float
    tax_amount: float
    cgst: float
    sgst: float
    igst: float
    cess: float


@dataclass
class TaxBreakdown:
    lines: list[TaxedLine] = field(default_factory=list)
    inclusive: bool = True
    composition: bool = False
    inter_state: bool = False
    # True when the buyer's state could not be resolved and the seller's state
    # was assumed. Callers should surface this rather than trust it silently.
    assumed_seller_state: bool = False
    seller_state_code: Optional[str] = None
    place_of_supply: Optional[str] = None
    shipping_amount: float = 0.0
    shipping_taxable: bool = False
    shipping_tax: float = 0.0
    total_taxable_value: float = 0.0
    total_tax: float = 0.0
    cgst_total: float = 0.0
    sgst_total: float = 0.0
    igst_total: float = 0.0
    cess_total: float = 0.0
    # Payable before invoice rounding, then the rounded figure a customer pays.
    payable: float = 0.0
    round_off: float = 0.0
    grand_total: float = 0.0

    def as_document(self) -> dict[str, Any]:
        """Serialise for the tax block stored on an order (a snapshot)."""
        return {
            "taxInclusive": self.inclusive,
            "compositionScheme": self.composition,
            "interState": self.inter_state,
            "placeOfSupply": self.place_of_supply,
            "sellerStateCode": self.seller_state_code,
            "shippingTaxable": self.shipping_taxable,
            "shippingTax": self.shipping_tax,
            "taxableValue": self.total_taxable_value,
            "totalTax": self.total_tax,
            "cgst": self.cgst_total,
            "sgst": self.sgst_total,
            "igst": self.igst_total,
            "cess": self.cess_total,
            "roundOff": self.round_off,
            "grandTotal": self.grand_total,
        }


def compute_tax(
    lines: Iterable[TaxableLine],
    *,
    policy: TaxPolicy,
    place_of_supply: Optional[str] = None,
    shipping_amount: float = 0.0,
    shipping_gst_rate: Optional[float] = None,
) -> TaxBreakdown:
    """Tax a set of lines plus freight under ``policy``.

    ``place_of_supply`` accepts a state name, alias or two-digit code, because
    buyer addresses hold free text.
    """
    breakdown = TaxBreakdown(
        inclusive=policy.inclusive,
        composition=policy.composition,
        seller_state_code=policy.seller_state_code,
        shipping_amount=round_money(max(float(shipping_amount or 0.0), 0.0)),
    )

    buyer_code = state_code_for(place_of_supply)
    breakdown.place_of_supply = buyer_code
    if buyer_code is None:
        # Unresolvable place of supply: assume the seller's own state so the
        # seller collects CGST+SGST rather than over-remitting IGST, and flag it.
        buyer_code = policy.seller_state_code
        breakdown.assumed_seller_state = True
    breakdown.inter_state = bool(
        buyer_code and policy.seller_state_code and buyer_code != policy.seller_state_code
    )

    for line in lines:
        # Taken literally: 0 means exempt, so callers resolve the rate first with
        # resolve_gst_rate() (product -> category -> store default) rather than
        # expecting this function to guess.
        rate = 0.0 if policy.composition else _safe_rate(line.gst_rate)
        cess_rate = 0.0 if policy.composition else _safe_rate(line.cess_rate)

        gross = round_money(float(line.unit_price) * float(line.quantity))
        discount = min(round_money(max(float(line.discount or 0.0), 0.0)), gross)
        net = round_money(gross - discount)

        if policy.inclusive:
            taxable = round_money(net / (1 + _fraction(rate))) if rate else net
            tax = round_money(net - taxable)
        else:
            taxable = net
            tax = round_money(net * _fraction(rate))

        cess = round_money(net * _fraction(cess_rate)) if cess_rate else 0.0
        cgst, sgst, igst = _split(tax, breakdown.inter_state)

        breakdown.lines.append(
            TaxedLine(
                name=line.name,
                quantity=float(line.quantity),
                unit_price=float(line.unit_price),
                hsn_code=line.hsn_code,
                gst_rate=rate,
                gross=gross,
                discount=discount,
                net=net,
                taxable_value=taxable,
                tax_amount=tax,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                cess=cess,
            )
        )
        breakdown.total_taxable_value = round_money(breakdown.total_taxable_value + taxable)
        breakdown.total_tax = round_money(breakdown.total_tax + tax + cess)
        breakdown.cgst_total = round_money(breakdown.cgst_total + cgst)
        breakdown.sgst_total = round_money(breakdown.sgst_total + sgst)
        breakdown.igst_total = round_money(breakdown.igst_total + igst)
        breakdown.cess_total = round_money(breakdown.cess_total + cess)

    # Freight follows the principal supply unless the store says otherwise.
    if breakdown.shipping_amount > 0 and policy.freight_taxable and not policy.composition:
        rate = _safe_rate(shipping_gst_rate)
        if rate == 0.0:
            rate = max((line.gst_rate for line in breakdown.lines), default=0.0)
        if rate:
            breakdown.shipping_taxable = True
            if policy.inclusive:
                taxable = round_money(
                    breakdown.shipping_amount / (1 + _fraction(rate))
                )
                breakdown.shipping_tax = round_money(
                    breakdown.shipping_amount - taxable
                )
            else:
                taxable = breakdown.shipping_amount
                breakdown.shipping_tax = round_money(
                    breakdown.shipping_amount * _fraction(rate)
                )
            cgst, sgst, igst = _split(breakdown.shipping_tax, breakdown.inter_state)
            breakdown.cgst_total = round_money(breakdown.cgst_total + cgst)
            breakdown.sgst_total = round_money(breakdown.sgst_total + sgst)
            breakdown.igst_total = round_money(breakdown.igst_total + igst)
            breakdown.total_taxable_value = round_money(
                breakdown.total_taxable_value + taxable
            )
            breakdown.total_tax = round_money(breakdown.total_tax + breakdown.shipping_tax)

    # Payable is the customer-facing figure the payment gateway must match.
    if policy.inclusive:
        payable = round_money(
            sum(line.net for line in breakdown.lines) + breakdown.shipping_amount
        )
    else:
        payable = round_money(
            breakdown.total_taxable_value
            + breakdown.total_tax
            + breakdown.shipping_amount
        )
    breakdown.payable = payable

    if policy.round_to_rupee_on_invoice:
        rounded = round_to_rupee(payable)
        breakdown.round_off = round_money(rounded - payable)
        breakdown.grand_total = round_money(rounded)
    else:
        breakdown.round_off = 0.0
        breakdown.grand_total = payable

    return breakdown


def _fraction(rate_percent: float) -> float:
    """GST rates are quoted as percentages (18 means 18%), maths needs 0.18."""
    return float(rate_percent) / 100.0


def _split(tax: float, inter_state: bool) -> tuple[float, float, float]:
    """Split a line's tax into CGST/SGST (intra) or IGST (inter).

    SGST takes the remainder so the two halves always re-add to ``tax`` exactly,
    which is what an invoice has to show.
    """
    if tax <= 0:
        return 0.0, 0.0, 0.0
    if inter_state:
        return 0.0, 0.0, round_money(tax)
    cgst = round_money(tax / 2)
    return cgst, round_money(tax - cgst), 0.0


def _safe_rate(rate: Any) -> float:
    try:
        value = float(rate or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return value if value > 0 else 0.0


def taxable_amount_for_rate(breakdown: TaxBreakdown) -> Sequence[dict[str, Any]]:
    """Rate-wise summary, the shape a GSTR-1 style report needs."""
    buckets: dict[float, dict[str, Any]] = {}
    for line in breakdown.lines:
        bucket = buckets.setdefault(
            line.gst_rate,
            {"rate": line.gst_rate, "taxableValue": 0.0, "tax": 0.0},
        )
        bucket["taxableValue"] = round_money(bucket["taxableValue"] + line.taxable_value)
        bucket["tax"] = round_money(bucket["tax"] + line.tax_amount)
    return [buckets[key] for key in sorted(buckets)]
