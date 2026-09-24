from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from bson import ObjectId
from fastapi import HTTPException

from app.database.mongo import ledger_entries, orders
from app.observability.alerts import alert
from app.services.delhivery_service import DelhiveryError, DelhiveryService
from app.services.ledger_service import record_order_refund, record_partial_refund
from app.services.order_fulfillment import restore_variant_stock
from app.services.shipping_context import get_active_delhivery_context
from app.utils.razorpay_client import client as razorpay_client

logger = logging.getLogger(__name__)

RETURN_WINDOW_DAYS = 2
RETURN_OPEN_STATUSES = {"requested", "approved"}
RETURN_BLOCKED_STATUSES = {"rejected", "received", "refunded"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _money(value) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _to2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _order_lines(order: dict) -> list[dict]:
    items = order.get("items")
    return items if isinstance(items, list) else []


def _line_quantity(line: dict) -> int:
    try:
        return max(int(line.get("quantity") or 0), 0)
    except (TypeError, ValueError):
        return 0


def _line_subtotal(line: dict) -> Decimal:
    if line.get("subtotal") is not None:
        return _money(line.get("subtotal"))
    return _money(line.get("price")) * _line_quantity(line)


def _item_key(product_id, variant_id) -> tuple[str, str]:
    return (str(product_id or "").strip(), str(variant_id or "").strip())


def _return_line(index: int, line: dict, quantity: int) -> dict:
    return {
        "lineIndex": index,
        "productId": str(line.get("productId") or ""),
        "variantId": line.get("variantId"),
        "name": line.get("name") or "Item",
        "price": line.get("price"),
        "quantity": quantity,
    }


def _whole_order_items(order: dict) -> list[dict]:
    return [
        _return_line(index, line, _line_quantity(line))
        for index, line in enumerate(_order_lines(order))
        if _line_quantity(line) > 0
    ]


def resolve_return_items(order: dict, requested: list[dict] | None) -> list[dict]:
    """Validate a customer's item selection against the order's lines.

    `None` means the whole order (older clients never send items). Requested
    quantities are matched by (productId, variantId); if the same variant
    appears on more than one line, the quantity is spread across those lines.
    """
    if requested is None:
        return _whole_order_items(order)
    if not requested:
        raise HTTPException(status_code=400, detail="Select at least one item to return.")

    wanted: dict[tuple[str, str], int] = defaultdict(int)
    for selection in requested:
        quantity = selection.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
            raise HTTPException(status_code=400, detail="Return quantity must be at least 1.")
        wanted[_item_key(selection.get("productId"), selection.get("variantId"))] += quantity

    lines = _order_lines(order)
    lines_by_key: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, line in enumerate(lines):
        lines_by_key[_item_key(line.get("productId"), line.get("variantId"))].append(index)

    selected: list[dict] = []
    for key, quantity in wanted.items():
        indexes = lines_by_key.get(key)
        if not indexes:
            raise HTTPException(
                status_code=400,
                detail="An item you selected is not part of this order.",
            )
        available = sum(_line_quantity(lines[index]) for index in indexes)
        if quantity > available:
            name = lines[indexes[0]].get("name") or "this item"
            raise HTTPException(
                status_code=400,
                detail=f"You can return at most {available} of {name}.",
            )
        for index in indexes:
            take = min(quantity, _line_quantity(lines[index]))
            if take > 0:
                selected.append(_return_line(index, lines[index], take))
                quantity -= take
            if quantity == 0:
                break
    selected.sort(key=lambda item: item["lineIndex"])
    return selected


def stored_return_items(order: dict, return_request: dict | None = None) -> list[dict]:
    """The items a return covers. Records created before item-level returns
    have no `items` and always meant the whole order."""
    current = return_request if return_request is not None else order.get("returnRequest")
    stored = current.get("items") if isinstance(current, dict) else None
    if not isinstance(stored, list) or not stored:
        return _whole_order_items(order)
    lines = _order_lines(order)
    result: list[dict] = []
    for item in stored:
        index = item.get("lineIndex")
        line = lines[index] if isinstance(index, int) and 0 <= index < len(lines) else None
        stored_key = _item_key(item.get("productId"), item.get("variantId"))
        if line is None or _item_key(line.get("productId"), line.get("variantId")) != stored_key:
            result.extend(
                resolve_return_items(
                    order,
                    [
                        {
                            "productId": item.get("productId"),
                            "variantId": item.get("variantId"),
                            "quantity": int(item.get("quantity") or 0),
                        }
                    ],
                )
            )
            continue
        quantity = min(int(item.get("quantity") or 0), _line_quantity(line))
        if quantity > 0:
            result.append(_return_line(index, line, quantity))
    return result


def covers_whole_order(order: dict, return_items: list[dict]) -> bool:
    returned: dict[int, int] = defaultdict(int)
    for item in return_items:
        returned[item["lineIndex"]] += int(item["quantity"])
    return all(
        returned.get(index, 0) >= _line_quantity(line)
        for index, line in enumerate(_order_lines(order))
    )


def calculate_refund_amount(
    order: dict,
    return_items: list[dict],
    *,
    already_refunded: float = 0.0,
) -> float:
    """What the customer gets back for these returned items.

    A whole-order return refunds everything still refundable (shipping
    included, as before). A partial return refunds each returned line's share
    of what was actually paid for it: the line subtotal minus its proportional
    share of the order discount. Shipping is not refunded on a partial return.
    """
    remaining = max(
        _money(order.get("totalAmount")) - _money(already_refunded), Decimal("0")
    )
    if covers_whole_order(order, return_items):
        return _to2(remaining)

    lines = _order_lines(order)
    subtotal = _money(order.get("subtotal")) or sum(
        (_line_subtotal(line) for line in lines), Decimal("0")
    )
    discount = min(max(_money(order.get("discount")), Decimal("0")), subtotal)
    returned_value = Decimal("0")
    for item in return_items:
        line = lines[item["lineIndex"]]
        line_quantity = _line_quantity(line)
        if line_quantity <= 0:
            continue
        returned_value += _line_subtotal(line) * int(item["quantity"]) / line_quantity
    discount_share = (
        discount * returned_value / subtotal if subtotal > 0 else Decimal("0")
    )
    amount = max(returned_value - discount_share, Decimal("0"))
    return _to2(min(amount, remaining))


def _order_refunded_amount(order: dict) -> float:
    return float(_money(order.get("refundedAmount")))


def _already_refunded(order: dict) -> float:
    """Refunds already made on this order's payment, including ad-hoc ones
    from the payments refund route, which only reach the ledger."""
    refunded = _order_refunded_amount(order)
    try:
        entry = ledger_entries.find_one({"orderId": order["_id"]}, {"refundedAmount": 1})
    except Exception:
        logger.exception("Could not read ledger entry for order %s", order.get("_id"))
        entry = None
    if entry:
        refunded = max(refunded, float(_money(entry.get("refundedAmount"))))
    return refunded


def serialize_return(order: dict) -> dict | None:
    data = order.get("returnRequest")
    if not isinstance(data, dict) or not data.get("status"):
        return None
    items = stored_return_items(order, data)
    refund_amount = data.get("refundAmount")
    if refund_amount is None:
        refund_amount = calculate_refund_amount(
            order, items, already_refunded=_order_refunded_amount(order)
        )
    return {
        "status": data.get("status"),
        "reason": data.get("reason") or "",
        "items": [
            {
                "productId": item["productId"],
                "variantId": item.get("variantId"),
                "name": item.get("name"),
                "price": item.get("price"),
                "quantity": item["quantity"],
            }
            for item in items
        ],
        "partial": not covers_whole_order(order, items),
        "refundAmount": refund_amount,
        "rejectReason": data.get("rejectReason") or "",
        "requestedAt": data.get("requestedAt"),
        "approvedAt": data.get("approvedAt"),
        "rejectedAt": data.get("rejectedAt"),
        "receivedAt": data.get("receivedAt"),
        "refundedAt": data.get("refundedAt"),
        "refundId": data.get("refundId"),
        "refundStatus": data.get("refundStatus"),
        "refundNote": data.get("refundNote") or "",
        "reverseAwb": data.get("reverseAwb"),
        "reverseTrackingUrl": data.get("reverseTrackingUrl"),
        "reverseNote": data.get("reverseNote") or "",
        "stockRestored": bool(data.get("stockRestored")),
        "windowDays": RETURN_WINDOW_DAYS,
    }


def delivered_at(order: dict) -> datetime | None:
    for key in ("deliveredAt", "updatedAt", "createdAt"):
        value = order.get(key)
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
    return None


def can_customer_request_return(order: dict, *, now: datetime | None = None) -> bool:
    if str(order.get("channel") or "") == "menu":
        return False
    if str(order.get("orderStatus") or "") != "delivered":
        return False
    existing = order.get("returnRequest")
    if isinstance(existing, dict):
        status = str(existing.get("status") or "")
        if status in RETURN_OPEN_STATUSES or status in {"received", "refunded"}:
            return False
    stamp = delivered_at(order)
    if not stamp:
        return False
    clock = now or _now()
    return clock - stamp <= timedelta(days=RETURN_WINDOW_DAYS)


def _load_order(order_id: str, tenant_id: str) -> dict:
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order ID.")
    order = orders.find_one({"_id": ObjectId(order_id), "tenantId": tenant_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


def _save_return(order: dict, payload: dict, order_status: str) -> dict:
    now = _now()
    orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "returnRequest": payload,
                "orderStatus": order_status,
                "updatedAt": now,
            }
        },
    )
    return orders.find_one({"_id": order["_id"]}) or order


def request_return(
    *,
    order_id: str,
    tenant_id: str,
    user_id: str,
    reason: str,
    items: list[dict] | None = None,
) -> dict:
    order = _load_order(order_id, tenant_id)
    if str(order.get("userId")) != str(user_id):
        raise HTTPException(status_code=403, detail="You cannot return this order.")
    if not can_customer_request_return(order):
        raise HTTPException(
            status_code=400,
            detail=(
                "Returns are available for 2 days after delivery. "
                "This order cannot be returned."
            ),
        )
    note = str(reason or "").strip()
    if len(note) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please describe why you want to return this order.",
        )
    return_items = resolve_return_items(order, items)
    if not return_items:
        raise HTTPException(status_code=400, detail="This order has no items to return.")
    now = _now()
    payload = {
        "status": "requested",
        "reason": note[:500],
        "items": return_items,
        "partial": not covers_whole_order(order, return_items),
        "refundAmount": calculate_refund_amount(
            order, return_items, already_refunded=_order_refunded_amount(order)
        ),
        "requestedAt": now,
        "stockRestored": False,
    }
    return _save_return(order, payload, "return_requested")


def reject_return(*, order_id: str, tenant_id: str, reason: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") != "requested":
        raise HTTPException(status_code=400, detail="No pending return to reject.")
    note = str(reason or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reject reason is required.")
    now = _now()
    payload = {
        **current,
        "status": "rejected",
        "rejectReason": note[:500],
        "rejectedAt": now,
    }
    return _save_return(order, payload, "delivered")


def _consignee_address(order: dict) -> dict:
    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    return address


def approve_return(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") != "requested":
        raise HTTPException(status_code=400, detail="No pending return to approve.")

    now = _now()
    payload = {
        **current,
        "status": "approved",
        "approvedAt": now,
        "reverseNote": "",
    }
    address = _consignee_address(order)
    ctx = get_active_delhivery_context(tenant_id)
    location = (ctx or {}).get("location") if ctx else None
    if ctx and isinstance(location, dict):
        items = stored_return_items(order, current)
        products_desc = (
            ", ".join(
                f"{str(item.get('name') or 'Item')[:40]} x{item['quantity']}"
                for item in items[:5]
            )
            or "Return goods"
        )
        try:
            result = DelhiveryService().create_reverse_shipment(
                tenant_id,
                pickup_location_name=ctx["pickupLocationName"],
                order_id=str(order["_id"]),
                consignee_name=str(address.get("fullName") or "Customer"),
                consignee_phone=str(address.get("phone") or ""),
                address=" ".join(
                    part
                    for part in [
                        str(address.get("addressLine1") or "").strip(),
                        str(address.get("addressLine2") or "").strip(),
                    ]
                    if part
                ),
                city=str(address.get("city") or ""),
                state=str(address.get("state") or ""),
                pincode=str(address.get("postalCode") or ""),
                country=str(address.get("country") or "India"),
                return_name=str(location.get("name") or ctx["pickupLocationName"]),
                return_address=str(location.get("address") or ""),
                return_city=str(location.get("city") or ""),
                return_state=str(location.get("state") or ""),
                return_pincode=str(location.get("pincode") or ctx.get("originPin") or ""),
                return_phone=str(location.get("phone") or ""),
                products_description=products_desc,
            )
            payload["reverseAwb"] = result["waybill"]
            payload["reverseTrackingUrl"] = result["trackingUrl"]
        except DelhiveryError as error:
            payload["reverseNote"] = str(error)[:400]
        except Exception as error:
            payload["reverseNote"] = str(error)[:400]
    else:
        payload["reverseNote"] = (
            "Delhivery is not connected. Arrange reverse pickup manually."
        )
    return _save_return(order, payload, "return_approved")


def mark_return_received(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    if str(current.get("status") or "") not in {"approved", "received"}:
        raise HTTPException(status_code=400, detail="Approve the return before marking it received.")
    now = _now()
    return_items = stored_return_items(order, current)
    lines = _order_lines(order)
    if not current.get("stockRestored"):
        for item in return_items:
            line = lines[item["lineIndex"]]
            variant_id = line.get("variantId")
            product_id = line.get("productId")
            if not variant_id or not product_id:
                continue
            restore_variant_stock(
                product_id if isinstance(product_id, ObjectId) else ObjectId(str(product_id)),
                str(variant_id),
                int(item["quantity"]),
                now,
            )
    payload = {
        **current,
        "status": "received",
        "receivedAt": now,
        "stockRestored": True,
    }
    order_status = (
        "returned" if covers_whole_order(order, return_items) else "partially_returned"
    )
    return _save_return(order, payload, order_status)


def _is_cod(order: dict) -> bool:
    method = str(order.get("paymentMethod") or "").lower()
    return method in {"cod", "cash_on_delivery"}


def issue_refund(*, order_id: str, tenant_id: str) -> dict:
    order = _load_order(order_id, tenant_id)
    current = order.get("returnRequest") if isinstance(order.get("returnRequest"), dict) else {}
    status = str(current.get("status") or "")
    if status not in {"received", "refunded"}:
        raise HTTPException(
            status_code=400,
            detail="Mark the return as received before refunding.",
        )
    if status == "refunded" and current.get("refundId"):
        return order

    now = _now()
    return_items = stored_return_items(order, current)
    whole_order = covers_whole_order(order, return_items)
    payload = {**current, "status": "refunded", "refundedAt": now}
    payment_id = str(order.get("razorpayPaymentId") or "").strip()

    if _is_cod(order) or not payment_id:
        refunded_status = "refunded" if whole_order else "partially_refunded"
        payload["refundAmount"] = calculate_refund_amount(
            order, return_items, already_refunded=_order_refunded_amount(order)
        )
        payload["refundStatus"] = "manual"
        payload["refundNote"] = "COD or unpaid online — refund the customer outside Razorpay."
        orders.update_one(
            {"_id": order["_id"]},
            {
                "$set": {
                    "returnRequest": payload,
                    "orderStatus": refunded_status,
                    "paymentStatus": (
                        refunded_status if not _is_cod(order) else order.get("paymentStatus")
                    ),
                    "refundStatus": payload["refundStatus"],
                    "updatedAt": now,
                }
            },
        )
        return orders.find_one({"_id": order["_id"]}) or order

    already_refunded = _already_refunded(order)
    remaining = _to2(
        max(_money(order.get("totalAmount")) - _money(already_refunded), Decimal("0"))
    )
    refund_amount = calculate_refund_amount(
        order, return_items, already_refunded=already_refunded
    )
    if refund_amount <= 0 and not whole_order:
        raise HTTPException(
            status_code=400,
            detail="Nothing is left to refund on this payment.",
        )
    # A partial return whose share reaches what's left refunds the rest in full.
    full_refund = whole_order or refund_amount >= remaining

    # Claim the refund first so a double click or a second admin can't send
    # two refunds to Razorpay for the same return.
    claimed = orders.find_one_and_update(
        {
            "_id": order["_id"],
            "returnRequest.status": "received",
            "returnRequest.refundInProgress": {"$ne": True},
        },
        {"$set": {"returnRequest.refundInProgress": True}},
    )
    if not claimed:
        raise HTTPException(
            status_code=409,
            detail="A refund for this return is already in progress.",
        )

    try:
        if full_refund:
            refund_data = razorpay_client.payment.refund(payment_id)
        else:
            refund_data = razorpay_client.payment.refund(
                payment_id, {"amount": int(round(refund_amount * 100))}
            )
    except Exception as error:
        orders.update_one(
            {"_id": order["_id"]},
            {"$unset": {"returnRequest.refundInProgress": ""}},
        )
        raise HTTPException(
            status_code=400,
            detail=f"Razorpay refund failed: {error}",
        ) from error

    refunded_status = "refunded" if full_refund else "partially_refunded"
    payload["refundAmount"] = refund_amount
    payload["refundId"] = (refund_data or {}).get("id")
    payload["refundStatus"] = (refund_data or {}).get("status") or "processed"
    payload["refundNote"] = "Refunded to original Razorpay payment."
    try:
        if full_refund:
            record_order_refund(order["_id"])
        else:
            record_partial_refund(order["_id"], refund_amount)
    except Exception as error:
        logger.exception("Failed to reverse ledger entry for order %s", order["_id"])
        alert(
            "ledger.write_failed",
            operation="return_refund",
            tenant_id=order.get("tenantId"),
            order_id=str(order["_id"]),
            error=error,
        )
    orders.update_one(
        {"_id": order["_id"]},
        {
            "$set": {
                "returnRequest": payload,
                "orderStatus": refunded_status,
                "paymentStatus": refunded_status,
                "refundStatus": payload["refundStatus"],
                "refundedAmount": _to2(_money(already_refunded) + _money(refund_amount)),
                "updatedAt": now,
            }
        },
    )
    return orders.find_one({"_id": order["_id"]}) or order
