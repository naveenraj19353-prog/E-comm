"""Platform-vs-store money tracking.

All stores share one platform Razorpay account, so the platform physically
holds the cash for every online (Razorpay) order. This module is the ledger
that tracks, per order, what the platform owes the store back:

    netAmount = grossAmount - platformCommission - razorpayGatewayFee - deliveryCharge

- grossAmount / platformCommission / razorpayGatewayFee are known the moment
  the payment is captured (the gateway fee is Razorpay's real fee+tax for
  that payment, fetched from their API, not estimated).
- deliveryCharge is NOT the checkout-quoted shipping estimate — it is the
  actual freight Delhivery charged for the shipment, fetched from Delhivery's
  invoicing API. That number usually isn't known until well after the order
  is placed (Delhivery finalizes it once the shipment is manifested/picked
  up), so a ledger entry starts with deliveryCharge=0/unsynced and is
  refreshed later via `sync_delivery_charge_for_order` — called from the
  Delhivery tracking routes, and available as an explicit retry endpoint,
  since there's no webhook for this in Delhivery's API.

Payouts are recorded manually — there is no Razorpay Route/linked-account
integration, so money still moves by bank transfer outside the app. A payout
now settles specific ledger entries (optionally scoped to a date range): the
platform sums that batch's net amounts, marks each entry `settled`, and that
settlement becomes each order's visible payment status.

COD and menu (pay-at-counter) orders are intentionally excluded: the store
collects that money directly, the platform never holds it, so there is
nothing here for the platform to owe back.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.config import PLATFORM_DEFAULT_COMMISSION_PERCENT
from app.database.mongo import ledger_entries, orders, payouts, shipments, tenants, users
from app.services.checkout_service import tenant_id_query
from app.utils.razorpay_client import client
from app.utils.order_ref import order_ref

logger = logging.getLogger(__name__)


def _round2(value: float) -> float:
    return round(float(value or 0) + 1e-9, 2)


def effective_commission_percent(tenant: dict | None) -> float:
    """The store's negotiated rate, or the platform default if none is set."""
    if tenant is not None:
        rate = tenant.get("platformCommissionPercent")
        if rate is not None:
            try:
                return float(rate)
            except (TypeError, ValueError):
                pass
    return PLATFORM_DEFAULT_COMMISSION_PERCENT


def _gateway_fee_for_payment(razorpay_payment_id: str) -> float:
    """Razorpay's actual fee + tax for this payment, in rupees (0 if unavailable)."""
    try:
        payment = client.payment.fetch(razorpay_payment_id)
    except Exception:
        logger.exception(
            "Could not fetch Razorpay payment %s for ledger fee lookup",
            razorpay_payment_id,
        )
        return 0.0
    fee_paise = int(payment.get("fee") or 0)
    tax_paise = int(payment.get("tax") or 0)
    return _round2((fee_paise + tax_paise) / 100)


def _recompute_net(entry: dict) -> float:
    return _round2(
        entry.get("grossAmount", 0.0)
        - entry.get("commissionAmount", 0.0)
        - entry.get("gatewayFee", 0.0)
        - entry.get("deliveryCharge", 0.0)
    )


def record_order_ledger_entry(order: dict) -> None:
    """Create the ledger entry for a freshly fulfilled Razorpay order.

    Safe to call at most once per order (enforced by a unique index on
    orderId) — callers should only call this right after inserting the order
    document for the first time, not on idempotent re-fulfillment. The actual
    delivery charge isn't known yet at this point, so it starts at 0/unsynced
    and is filled in later by `sync_delivery_charge_for_order`.
    """
    razorpay_payment_id = order.get("razorpayPaymentId")
    if not razorpay_payment_id:
        return  # COD / menu orders never held funds on the platform account.

    tenant_id = order["tenantId"]
    tenant = tenants.find_one({"tenantId": tenant_id_query(tenant_id)})
    commission_percent = effective_commission_percent(tenant)
    gross_amount = _round2(order.get("totalAmount"))
    commission_amount = _round2(gross_amount * commission_percent / 100)
    gateway_fee = _gateway_fee_for_payment(razorpay_payment_id)
    net_amount = _round2(gross_amount - commission_amount - gateway_fee)
    now = datetime.now(timezone.utc)

    try:
        ledger_entries.insert_one(
            {
                "tenantId": tenant_id,
                "orderId": order["_id"],
                "orderNumber": order.get("orderNumber"),
                "razorpayPaymentId": razorpay_payment_id,
                "grossAmount": gross_amount,
                "refundedAmount": 0.0,
                "commissionPercent": commission_percent,
                "commissionAmount": commission_amount,
                "gatewayFee": gateway_fee,
                "deliveryCharge": 0.0,
                "deliveryChargeSynced": False,
                "netAmount": net_amount,
                "status": "pending",
                "settled": False,
                "payoutId": None,
                "createdAt": now,
                "updatedAt": now,
            }
        )
    except DuplicateKeyError:
        logger.warning("Ledger entry already exists for order %s", order["_id"])


def sync_delivery_charge_for_order(order_id, tenant_id: str) -> bool:
    """Fetch the real Delhivery charge for this order's shipment and apply it.

    Returns False (no-op) if there's no ledger entry for this order **under
    this tenant** (this is also the tenant-ownership check — callers must not
    skip passing a caller-verified tenant_id), no Delhivery shipment yet, the
    entry is already settled (a paid-out order's numbers shouldn't move under
    a store's feet), or Delhivery hasn't finalized a charge yet.
    """
    if isinstance(order_id, str):
        order_id = ObjectId(order_id)
    entry = ledger_entries.find_one(
        {"orderId": order_id, "tenantId": tenant_id_query(tenant_id)}
    )
    if not entry or entry.get("settled"):
        return False

    shipment = shipments.find_one(
        {
            "tenantId": entry["tenantId"],
            "orderId": str(order_id),
            "provider": "delhivery",
        },
        {"awb": 1},
    )
    waybill = (shipment or {}).get("awb")
    if not waybill:
        return False

    from app.services.delhivery_service import DelhiveryService

    charge = DelhiveryService().fetch_shipment_charges(entry["tenantId"], waybill)
    if charge is None:
        return False  # Delhivery hasn't finalized a charge yet.

    updated = {**entry, "deliveryCharge": _round2(charge), "deliveryChargeSynced": True}
    updated["netAmount"] = _recompute_net(updated)
    ledger_entries.update_one(
        {"_id": entry["_id"]},
        {
            "$set": {
                "deliveryCharge": updated["deliveryCharge"],
                "deliveryChargeSynced": True,
                "netAmount": updated["netAmount"],
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    return True


def record_order_refund(order_id) -> None:
    """Reverse an order's ledger entry after its Razorpay payment is refunded.

    Refunds here are always full-order (see return_service.issue_refund), so
    the platform commission on that order is fully reversed. Razorpay does
    not return its own fee on a refund, so the platform is left having eaten
    that fee. Returns only happen after a `delivered` order (see
    RETURN_OPEN_STATUSES upstream), so the store already incurred the real
    Delhivery cost — it still gets that portion back. Net after refund is
    therefore `deliveryCharge - gatewayFee`, not simply zero.

    If the entry was already settled (paid out before the refund happened),
    overwriting netAmount would silently lose the difference between what was
    already paid and what's actually owed now. Instead, the entry is reopened
    as unsettled holding just the adjustment (new true net minus what was
    already paid) so it's picked up correctly by the next payout — which may
    mean the store now owes the platform money back, i.e. a negative payout.
    """
    now = datetime.now(timezone.utc)
    entry = ledger_entries.find_one({"orderId": order_id})
    if not entry:
        return
    gross_amount = entry.get("grossAmount", 0.0)
    gateway_fee = entry.get("gatewayFee", 0.0)
    delivery_charge = entry.get("deliveryCharge", 0.0)
    true_net_after_refund = _round2(delivery_charge - gateway_fee)

    update = {
        "refundedAmount": gross_amount,
        "commissionAmount": 0.0,
        "status": "refunded",
        "updatedAt": now,
    }
    if entry.get("settled"):
        already_paid = entry.get("settledNetAmount", entry.get("netAmount", 0.0))
        update["netAmount"] = _round2(true_net_after_refund - already_paid)
        update["settled"] = False
        update["payoutId"] = None
    else:
        update["netAmount"] = true_net_after_refund

    ledger_entries.update_one({"_id": entry["_id"]}, {"$set": update})


def record_partial_refund(order_id, refund_amount: float) -> None:
    """Apply an ad-hoc partial refund (e.g. `/payments/refund/{id}` with an
    explicit amount) to an order's ledger entry.

    Unlike `record_order_refund` (a full-order return — see its docstring for
    why that one gives the delivery charge back to the store), a partial
    refund here leaves gatewayFee and deliveryCharge untouched: the shipment
    already went out for its full cost regardless of a partial discount/
    goodwill refund, so only the commission on the refunded slice is given
    back, proportionally.
    """
    entry = ledger_entries.find_one({"orderId": order_id})
    if not entry:
        return

    gross_amount = entry.get("grossAmount", 0.0)
    prior_refunded = entry.get("refundedAmount", 0.0)
    remaining = _round2(gross_amount - prior_refunded)
    refund_amount = min(_round2(refund_amount), remaining)
    if refund_amount <= 0:
        return

    commission_percent = entry.get("commissionPercent", 0.0)
    commission_amount = entry.get("commissionAmount", 0.0)
    commission_given_back = min(
        commission_amount, _round2(refund_amount * commission_percent / 100)
    )
    delta = _round2(commission_given_back - refund_amount)  # always <= 0

    now = datetime.now(timezone.utc)
    update = {
        "refundedAmount": _round2(prior_refunded + refund_amount),
        "commissionAmount": _round2(commission_amount - commission_given_back),
        "updatedAt": now,
    }
    if prior_refunded + refund_amount >= gross_amount - 0.01:
        update["status"] = "refunded"

    if entry.get("settled"):
        # Already paid out — this refund is a fresh debt, not a rewrite of
        # what was already settled and paid.
        update["netAmount"] = delta
        update["settled"] = False
        update["payoutId"] = None
    else:
        update["netAmount"] = _round2(entry.get("netAmount", 0.0) + delta)

    ledger_entries.update_one({"_id": entry["_id"]}, {"$set": update})


def _tenant_ledger_query(tenant_id: str, from_date=None, to_date=None) -> dict:
    query: dict = {"tenantId": tenant_id_query(tenant_id)}
    date_filter = {}
    if from_date is not None:
        date_filter["$gte"] = from_date
    if to_date is not None:
        date_filter["$lte"] = to_date
    if date_filter:
        query["createdAt"] = date_filter
    return query


_LEDGER_SUMMABLE_FIELDS = (
    "grossAmount",
    "refundedAmount",
    "commissionAmount",
    "gatewayFee",
    "deliveryCharge",
    "netAmount",
)


def _summary_for_entries(tenant_id: str, from_date=None, to_date=None) -> dict:
    query = _tenant_ledger_query(tenant_id, from_date, to_date)

    def _sum_pipeline(extra_match: dict) -> dict:
        pipeline = [
            {"$match": {**query, **extra_match}},
            {
                "$group": {
                    "_id": None,
                    **{
                        field: {"$sum": f"${field}"}
                        for field in _LEDGER_SUMMABLE_FIELDS
                    },
                }
            },
        ]
        return next(ledger_entries.aggregate(pipeline), None) or {}

    aggregated = _sum_pipeline({})
    totals = {
        field: _round2(aggregated.get(field, 0.0)) for field in _LEDGER_SUMMABLE_FIELDS
    }
    unsettled = _sum_pipeline({"settled": {"$ne": True}})
    settled = _sum_pipeline({"settled": True})
    totals["balanceDue"] = _round2(unsettled.get("netAmount", 0.0))
    totals["totalPaidOut"] = _round2(settled.get("netAmount", 0.0))
    return totals


def get_statement(
    tenant_id: str,
    *,
    page: int = 1,
    page_size: int = 25,
    from_date=None,
    to_date=None,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    query = _tenant_ledger_query(tenant_id, from_date, to_date)
    total = ledger_entries.count_documents(query)
    cursor = (
        ledger_entries.find(query)
        .sort("createdAt", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    raw_entries = list(cursor)
    # Entries written before orderNumber was copied onto the ledger: look the
    # number up on the order itself, in one query.
    missing = [e["orderId"] for e in raw_entries if not e.get("orderNumber")]
    numbers = {
        doc["_id"]: doc.get("orderNumber")
        for doc in orders.find({"_id": {"$in": missing}}, {"orderNumber": 1})
    } if missing else {}
    entries = []
    for entry in raw_entries:
        number = entry.get("orderNumber") or numbers.get(entry["orderId"])
        entries.append(
            {
                **entry,
                "_id": str(entry["_id"]),
                "orderId": str(entry["orderId"]),
                "orderNumber": number,
                "orderRef": order_ref({"orderNumber": number, "_id": entry["orderId"]}),
                "settled": bool(entry.get("settled")),
                "payoutId": str(entry["payoutId"]) if entry.get("payoutId") else None,
            }
        )
    return {
        "entries": entries,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "summary": _summary_for_entries(tenant_id, from_date, to_date),
    }


def get_payouts(tenant_id: str, *, page: int = 1, page_size: int = 25) -> dict:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    query = {"tenantId": tenant_id_query(tenant_id)}
    total = payouts.count_documents(query)
    cursor = (
        payouts.find(query)
        .sort("createdAt", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    raw_payouts = list(cursor)
    # recordedBy is the id of the super admin (a `users` doc with
    # tenantId None) who recorded the payout; resolve names in one query.
    recorder_ids = {
        ObjectId(str(doc["recordedBy"]))
        for doc in raw_payouts
        if doc.get("recordedBy") and ObjectId.is_valid(str(doc["recordedBy"]))
    }
    names = {
        str(user["_id"]): user.get("name")
        for user in users.find({"_id": {"$in": list(recorder_ids)}}, {"name": 1})
    } if recorder_ids else {}
    return {
        "payouts": [
            {
                **doc,
                "_id": str(doc["_id"]),
                "recordedByName": names.get(str(doc.get("recordedBy") or "")) or None,
            }
            for doc in raw_payouts
        ],
        "page": page,
        "pageSize": page_size,
        "total": total,
    }


def record_payout(
    tenant_id: str,
    note: str | None,
    recorded_by: str | None,
    *,
    from_date=None,
    to_date=None,
) -> dict:
    """Settle every unsettled ledger entry for this tenant (optionally scoped
    to a date range) and record the resulting payout.

    The amount is always the sum of what's actually being settled — never
    typed in by hand — so a store's per-order "paid" status can never drift
    from what the platform actually recorded as paid out.
    """
    query = {
        **_tenant_ledger_query(tenant_id, from_date, to_date),
        "settled": {"$ne": True},
    }
    to_settle = list(ledger_entries.find(query, {"_id": 1, "netAmount": 1}))
    if not to_settle:
        raise HTTPException(
            status_code=400,
            detail="There is nothing unsettled for this store in that range.",
        )
    amount = _round2(sum(float(e.get("netAmount") or 0) for e in to_settle))
    now = datetime.now(timezone.utc)
    payload = {
        "tenantId": tenant_id,
        "amount": amount,
        "note": (note or "").strip() or None,
        "recordedBy": recorded_by,
        "fromDate": from_date,
        "toDate": to_date,
        "entryCount": len(to_settle),
        "createdAt": now,
    }
    result = payouts.insert_one(payload)
    payout_id = result.inserted_id
    for entry in to_settle:
        # Freeze what was actually paid (settledNetAmount), separately from
        # netAmount, so a later refund can compute the right adjustment
        # instead of silently overwriting a number that's already been paid.
        ledger_entries.update_one(
            {"_id": entry["_id"]},
            {
                "$set": {
                    "settled": True,
                    "payoutId": payout_id,
                    "settledNetAmount": _round2(entry.get("netAmount") or 0),
                    "updatedAt": now,
                }
            },
        )
    payload["_id"] = str(payout_id)
    return payload


def set_tenant_commission(tenant_id: str, percent: float | None) -> None:
    if percent is not None and not (0 <= percent <= 100):
        raise HTTPException(
            status_code=400,
            detail="Commission percent must be between 0 and 100.",
        )
    update = (
        {"$set": {"platformCommissionPercent": percent}}
        if percent is not None
        else {"$unset": {"platformCommissionPercent": ""}}
    )
    update.setdefault("$set", {})
    update["$set"]["updatedAt"] = datetime.now(timezone.utc)
    result = tenants.update_one({"tenantId": tenant_id_query(tenant_id)}, update)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found.")


def platform_overview(
    *, page: int = 1, page_size: int = 25, from_date=None, to_date=None
) -> dict:
    """Per-tenant balances for the super-admin ledger screen."""
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    all_tenants = list(
        tenants.find(
            {},
            {"tenantId": 1, "name": 1, "slug": 1, "platformCommissionPercent": 1},
        ).sort("name", 1)
    )
    rows = []
    for tenant in all_tenants:
        tenant_id = tenant.get("tenantId")
        if not tenant_id:
            continue
        summary = _summary_for_entries(tenant_id, from_date, to_date)
        if summary["grossAmount"] == 0 and summary["totalPaidOut"] == 0:
            continue
        rows.append(
            {
                "tenantId": tenant_id,
                "name": tenant.get("name"),
                "slug": tenant.get("slug"),
                "commissionPercent": effective_commission_percent(tenant),
                **summary,
            }
        )
    total = len(rows)
    start = (page - 1) * page_size
    return {
        "rows": rows[start : start + page_size],
        "page": page,
        "pageSize": page_size,
        "total": total,
    }
