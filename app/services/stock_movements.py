"""Stock movement log and manual stock adjustments (REQ-034, REQ-036).

Every change to a variant's stock can be written to `stock_movements` with
where it came from:

    manual_adjustment      admin "Adjust stock" form (quantity + reason required)
    product_edit           stock typed into the product edit form
    order_placed           taken for a COD / menu order
    checkout_reserved      held when a customer starts paying online
    reservation_released   released because the checkout was never paid
    order_cancelled        put back when an admin cancels an order
    return_received        put back when a returned item arrives
    receiving              added when an admin receives new stock (written
                           inside the receiving transaction, not best-effort)

Logging is best-effort: a failure to write the log never blocks an order or a
stock change (it is logged as an error instead).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId

logger = logging.getLogger(__name__)

SOURCES = {
    "manual_adjustment",
    "product_edit",
    "order_placed",
    "checkout_reserved",
    "reservation_released",
    "order_cancelled",
    "return_received",
    "receiving",
}

# Reasons offered in the admin "Adjust stock" form.
ADJUSTMENT_REASONS = {
    "received": "Received new stock",
    "count_correction": "Stock count correction",
    "damaged": "Damaged",
    "lost": "Lost or stolen",
    "returned_offline": "Returned (offline)",
    "sold_offline": "Sold offline",
    "other": "Other",
}

MAX_ADJUSTMENT = 100_000
MAX_NOTE_LENGTH = 200
DEFAULT_HISTORY_LIMIT = 50
MAX_HISTORY_LIMIT = 200


class StockAdjustmentError(ValueError):
    """Invalid adjustment request; the route turns it into a 400."""


def validate_adjustment(change: int, reason: str, note: str | None) -> tuple[int, str, str]:
    """Return a clean (change, reason, note) or raise StockAdjustmentError."""
    if isinstance(change, bool) or not isinstance(change, int):
        raise StockAdjustmentError("Quantity must be a whole number.")
    if change == 0:
        raise StockAdjustmentError("Quantity cannot be 0.")
    if abs(change) > MAX_ADJUSTMENT:
        raise StockAdjustmentError(f"Quantity must be between -{MAX_ADJUSTMENT} and {MAX_ADJUSTMENT}.")
    reason = (reason or "").strip()
    if reason not in ADJUSTMENT_REASONS:
        raise StockAdjustmentError("Choose a reason for the adjustment.")
    clean_note = (note or "").strip()[:MAX_NOTE_LENGTH]
    if reason == "other" and not clean_note:
        raise StockAdjustmentError("Add a note when the reason is 'Other'.")
    return change, reason, clean_note


def variant_stock(product: dict | None, variant_id: str) -> int | None:
    for item in (product or {}).get("inventory") or []:
        if str(item.get("variantId")) == str(variant_id):
            try:
                return int(item.get("stock", 0) or 0)
            except (TypeError, ValueError):
                return 0
    return None


def inventory_changes(old_inventory: list | None, new_inventory: list | None) -> list[dict]:
    """Per-variant stock differences between two inventory lists (for product edits).

    Variants added count as +stock, removed variants as -stock.
    """
    def by_variant(items):
        result = {}
        for item in items or []:
            variant_id = str(item.get("variantId") or "")
            if not variant_id:
                continue
            try:
                stock = int(item.get("stock", 0) or 0)
            except (TypeError, ValueError):
                stock = 0
            result[variant_id] = (stock, item)
        return result

    old = by_variant(old_inventory)
    new = by_variant(new_inventory)
    changes: list[dict] = []
    for variant_id in sorted(set(old) | set(new)):
        before = old.get(variant_id, (0, {}))[0]
        after = new.get(variant_id, (0, {}))[0]
        if before == after:
            continue
        item = (new.get(variant_id) or old.get(variant_id))[1]
        changes.append(
            {
                "variantId": variant_id,
                "color": item.get("color"),
                "size": item.get("size"),
                "change": after - before,
                "stockAfter": after,
            }
        )
    return changes


def build_movement(
    *,
    tenant_id: str,
    product: dict,
    variant_id: str,
    change: int,
    source: str,
    stock_after: int | None,
    reason: str | None = None,
    note: str | None = None,
    order_id=None,
    user: dict | None = None,
    now: datetime | None = None,
    stock_before: int | None = None,
    reference_id: str | None = None,
) -> dict:
    variant = next(
        (item for item in product.get("inventory") or [] if str(item.get("variantId")) == str(variant_id)),
        {},
    )
    doc = {
        "tenantId": tenant_id,
        "productId": product.get("_id"),
        "productName": product.get("name"),
        "variantId": str(variant_id),
        "color": variant.get("color"),
        "size": variant.get("size"),
        "change": int(change),
        "stockAfter": stock_after,
        "source": source if source in SOURCES else "other",
        "reason": reason,
        "note": note or None,
        "orderId": str(order_id) if order_id else None,
        "createdAt": now or datetime.now(timezone.utc),
    }
    # Only set by callers that know them (receiving), so other rows keep their shape.
    if stock_before is not None:
        doc["stockBefore"] = int(stock_before)
    if reference_id:
        doc["referenceId"] = str(reference_id)
    if user:
        doc["userId"] = str(user.get("userId") or "") or None
        doc["userName"] = user.get("name") or user.get("email")
        doc["userRole"] = user.get("role")
    return doc


def serialize_movement(doc: dict) -> dict:
    created = doc.get("createdAt")
    reason = doc.get("reason")
    return {
        "id": str(doc.get("_id")),
        "productId": str(doc.get("productId")) if doc.get("productId") else None,
        "productName": doc.get("productName"),
        "variantId": doc.get("variantId"),
        "color": doc.get("color"),
        "size": doc.get("size"),
        "change": doc.get("change"),
        "stockBefore": doc.get("stockBefore"),
        "stockAfter": doc.get("stockAfter"),
        "source": doc.get("source"),
        "reason": reason,
        "reasonLabel": ADJUSTMENT_REASONS.get(reason) if reason else None,
        "note": doc.get("note"),
        "orderId": doc.get("orderId"),
        "referenceId": doc.get("referenceId"),
        "userName": doc.get("userName"),
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else created,
    }


def record_movements(collection, docs: list[dict]) -> None:
    """Insert log rows; never raises."""
    if not docs:
        return
    try:
        collection.insert_many(docs, ordered=False)
    except Exception:
        logger.exception("Could not write stock movement log (%s rows)", len(docs))


def product_object_id(value) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    text = str(value or "")
    return ObjectId(text) if ObjectId.is_valid(text) else None
