"""Bridges the storefront cart to the GST engine in ``tax_service``.

Kept out of ``checkout_service`` so cart pricing and tax rules stay
independently testable, and so ``tax_service`` remains stdlib-only.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

from app.services.tax_service import (
    TaxBreakdown,
    TaxPolicy,
    TaxableLine,
    compute_tax,
    resolve_gst_rate,
    round_money,
    taxable_amount_for_rate,
)

#: Only these tenant sub-documents are needed to build a policy.
_TENANT_PROJECTION = {"tax": 1, "businessDetails": 1}


def load_tax_policy(tenant_id: str) -> TaxPolicy:
    """The store's tax policy. A store that configured no rate taxes nothing."""
    from app.database.mongo import tenants
    from app.services.checkout_service import tenant_id_query

    tenant = tenants.find_one(
        {"tenantId": tenant_id_query(tenant_id)}, _TENANT_PROJECTION
    )
    return TaxPolicy.from_tenant(tenant)


def _category_rates(
    tenant_id: str, items: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    """``categoryId`` -> ``defaultGstRate``, for the categories this cart touches.

    One query for the whole cart rather than one per line.
    """
    from app.database.mongo import categories
    from app.services.checkout_service import as_object_id, tenant_id_query

    object_ids = []
    for item in items:
        object_id = as_object_id(item.get("categoryId"))
        if object_id is not None:
            object_ids.append(object_id)
    if not object_ids:
        return {}

    rates: dict[str, Any] = {}
    for document in categories.find(
        {"tenantId": tenant_id_query(tenant_id), "_id": {"$in": object_ids}},
        {"defaultGstRate": 1},
    ):
        rates[str(document["_id"])] = document.get("defaultGstRate")
    return rates


def allocate_discount(
    items: Sequence[Mapping[str, Any]], discount: float
) -> list[float]:
    """Spread an order-level coupon across lines in proportion to line value.

    Tax has to be computed on what the customer was actually charged, so the
    discount must land on the lines rather than being applied to the order
    afterwards. The largest line absorbs the rounding remainder so the parts
    always re-add to the whole exactly.
    """
    line_totals = [round_money(float(item.get("subtotal") or 0.0)) for item in items]
    total = round_money(sum(line_totals))
    target = min(round_money(max(float(discount or 0.0), 0.0)), total)
    if target <= 0 or total <= 0:
        return [0.0] * len(items)

    shares = [round_money(value * target / total) for value in line_totals]
    remainder = round_money(target - round_money(sum(shares)))
    if remainder and shares:
        index = max(range(len(shares)), key=lambda position: shares[position])
        shares[index] = round_money(shares[index] + remainder)
    return shares


def build_taxable_lines(
    items: Sequence[Mapping[str, Any]],
    *,
    policy: TaxPolicy,
    category_rates: Optional[Mapping[str, Any]] = None,
    discounts: Optional[Sequence[float]] = None,
) -> list[TaxableLine]:
    """Resolve each line's rate as product -> category -> store default.

    ``category_rates`` is injected rather than fetched so the pricing rules can
    be exercised without a database.
    """
    category_rates = category_rates or {}
    lines: list[TaxableLine] = []
    for index, item in enumerate(items):
        lines.append(
            TaxableLine(
                quantity=float(item.get("quantity") or 0.0),
                unit_price=float(item.get("price") or 0.0),
                gst_rate=resolve_gst_rate(
                    product_rate=item.get("gstRate"),
                    category_rate=category_rates.get(str(item.get("categoryId"))),
                    policy=policy,
                ),
                hsn_code=item.get("hsnCode"),
                discount=float(discounts[index]) if discounts else 0.0,
                name=str(item.get("name") or ""),
            )
        )
    return lines


def taxable_lines(
    items: Sequence[Mapping[str, Any]],
    *,
    tenant_id: str,
    policy: TaxPolicy,
    discounts: Optional[Sequence[float]] = None,
) -> list[TaxableLine]:
    """As ``build_taxable_lines``, loading the cart's category rates first."""
    return build_taxable_lines(
        items,
        policy=policy,
        category_rates=_category_rates(tenant_id, items),
        discounts=discounts,
    )


def compute_checkout_tax(
    *,
    tenant_id: str,
    items: Sequence[Mapping[str, Any]],
    discount: float = 0.0,
    shipping: float = 0.0,
    place_of_supply: Optional[str] = None,
    policy: Optional[TaxPolicy] = None,
    category_rates: Optional[Mapping[str, Any]] = None,
) -> TaxBreakdown:
    """Tax a cart. ``place_of_supply`` is the buyer's state, as free text."""
    policy = policy or load_tax_policy(tenant_id)
    return compute_tax(
        build_taxable_lines(
            items,
            policy=policy,
            category_rates=(
                category_rates
                if category_rates is not None
                else _category_rates(tenant_id, items)
            ),
            discounts=allocate_discount(items, discount),
        ),
        policy=policy,
        place_of_supply=place_of_supply,
        shipping_amount=shipping,
    )


def tax_summary(breakdown: TaxBreakdown) -> dict[str, Any]:
    """The shape the cart and checkout screens render.

    Line order matches the cart's, so an order can pair line ``n`` of the tax
    block with line ``n`` of its items and snapshot what each was charged.
    """
    return {
        **breakdown.as_document(),
        "assumedSellerState": breakdown.assumed_seller_state,
        "rateWise": list(taxable_amount_for_rate(breakdown)),
        "lines": [
            {
                "name": line.name,
                "hsnCode": line.hsn_code,
                "gstRate": line.gst_rate,
                "discount": line.discount,
                "net": line.net,
                "taxableValue": line.taxable_value,
                "taxAmount": line.tax_amount,
                "cgst": line.cgst,
                "sgst": line.sgst,
                "igst": line.igst,
            }
            for line in breakdown.lines
        ],
    }
