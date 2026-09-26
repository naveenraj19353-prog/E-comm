"""GST reversal for returns — the credit-note figures.

Stdlib-only (plus ``tax_service``) so the arithmetic can be tested without a
database or FastAPI. ``return_service`` wraps this with the order-shape helpers
it already has.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Mapping, Sequence

from app.services.tax_service import split_tax


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value is not None else 0))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _to2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _ordered_lines(order: Mapping[str, Any]) -> list[dict]:
    items = order.get("items")
    return items if isinstance(items, list) else []


def _line_quantity(line: Mapping[str, Any]) -> int:
    try:
        return max(int(line.get("quantity") or 0), 0)
    except (TypeError, ValueError):
        return 0


def _payload(
    taxable: Decimal, tax: Decimal, cess: Decimal, inter_state: bool
) -> dict[str, Any]:
    cgst, sgst, igst = split_tax(float(tax), inter_state)
    return {
        "taxableValue": _to2(taxable),
        "taxAmount": _to2(tax),
        "cgst": cgst,
        "sgst": sgst,
        "igst": igst,
        "cess": _to2(cess),
    }


def reverse_tax(
    order: Mapping[str, Any],
    return_items: Sequence[Mapping[str, Any]],
    *,
    whole_order: bool,
    already_refunded: float = 0.0,
) -> dict[str, Any]:
    """GST to reverse for a return.

    The refund itself is gross (the customer paid a tax-inclusive price, so
    returning it returns the tax too). This is the split a merchant needs to
    file: a whole-order return reverses the tax still outstanding, freight
    included; a partial return reverses each returned line's share of the tax
    that line was charged. More GST is never credited back than was collected.
    """
    tax_block = order.get("tax") or {}
    total_tax = _money(tax_block.get("totalTax"))
    if total_tax <= 0:
        return _payload(Decimal("0"), Decimal("0"), Decimal("0"), False)

    inter_state = bool(tax_block.get("interState"))
    total_taxable = _money(tax_block.get("taxableValue"))
    cess = _money(tax_block.get("cess"))

    if whole_order:
        # Earlier partial returns on this order already reversed their share.
        order_total = _money(order.get("totalAmount"))
        outstanding = Decimal("1")
        if order_total > 0 and already_refunded > 0:
            outstanding = max(
                Decimal("1") - _money(already_refunded) / order_total, Decimal("0")
            )
        return _payload(
            total_taxable * outstanding,
            total_tax * outstanding,
            cess * outstanding,
            inter_state,
        )

    lines = _ordered_lines(order)
    returned_taxable = Decimal("0")
    returned_tax = Decimal("0")
    for item in return_items:
        index = item.get("lineIndex")
        if not isinstance(index, int) or not 0 <= index < len(lines):
            continue
        line = lines[index]
        line_quantity = _line_quantity(line)
        quantity = int(item.get("quantity") or 0)
        if line_quantity <= 0 or quantity <= 0:
            continue
        share = Decimal(min(quantity, line_quantity)) / line_quantity
        returned_taxable += _money(line.get("taxableValue")) * share
        returned_tax += _money(line.get("taxAmount")) * share

    capped_tax = min(returned_tax, total_tax)
    cess_share = (cess * capped_tax / total_tax) if total_tax > 0 else Decimal("0")
    return _payload(
        min(returned_taxable, total_taxable), capped_tax, cess_share, inter_state
    )
