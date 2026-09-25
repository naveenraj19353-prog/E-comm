"""Automatic order status updates from Delhivery tracking.

One shipment at a time: pull (or receive via push) Delhivery's status,
classify it with `classify_tracking`, record it on the shipment, and move the
order forward — never backwards, never touching cancelled orders:

  in transit / dispatched / pending   → order `shipped`   (from confirmed/processing)
  delivered                           → order `delivered` (from confirmed/processing/shipped;
                                        deliveredAt, COD → paid, delivery charge synced)
  RTO / returned / lost / cancelled   → `courier.exception` on the order for the admin;
                                        order status and money are left alone

Every order write is conditional on the order still being in a status we may
move from, so a concurrent admin cancel or a second process can't be undone
or double-notified. WhatsApp notifications reuse the order-status events,
which are idempotent per order+event.

`run_sync_once` is the background job: it takes a MongoDB lease so only one
process in the deployment runs at a time, and holds the lease until the next
scheduled run so N processes still give one run per interval.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import socket
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import BackgroundTasks
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.config import SHIPMENT_SYNC_BATCH_SIZE, SHIPMENT_SYNC_MINUTES
from app.observability import heartbeat
from app.observability.alerts import alert
from app.database.mongo import db, orders, shipments
from app.services.delhivery_service import (
    PROVIDER,
    DelhiveryError,
    DelhiveryService,
    classify_tracking,
    normalize_tracking_shipment,
)
from app.services.whatsapp_notification_service import send_order_status_update

logger = logging.getLogger(__name__)

job_locks = db["job_locks"]

LOCK_NAME = "delhivery_shipment_sync"
# Stop polling shipments that never reach a closed state.
MAX_SHIPMENT_AGE_DAYS = 60
# Delhivery: tracking 750 req / 5 min / IP (2.5/s); charge calculator 40/min.
TRACK_REQUEST_INTERVAL_SECONDS = 0.5
CHARGE_REQUEST_INTERVAL_SECONDS = 2.0
# A run gives up the remaining batch after this long; the lease outlives it.
MAX_RUN_SECONDS = 8 * 60
# Sentry Cron monitor for "the sync stopped running" (see observability/heartbeat).
MONITOR_SLUG = "delhivery-shipment-sync"
LEASE_SECONDS = 10 * 60

SHIPPED_FROM = ("confirmed", "processing", "packed")
DELIVERED_FROM = ("confirmed", "processing", "packed", "shipped")
# Exceptions are flagged only on orders still on their way to the customer.
EXCEPTION_ON = ("confirmed", "processing", "packed", "shipped")

SHIPMENT_STATUS_FOR = {
    "in_transit": "in_transit",
    "delivered": "delivered",
    "rto": "rto",
    "rto_delivered": "rto_delivered",
    "lost": "lost",
    "cancelled": "cancelled",
}

_OWNER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Applying one tracking update
# --------------------------------------------------------------------------


def _order_object_id(shipment: dict):
    from bson import ObjectId

    order_id = str(shipment.get("orderId") or "")
    return ObjectId(order_id) if ObjectId.is_valid(order_id) else None


def _sync_delivery_charge(order_id: str, tenant_id: str, pace: Callable[[], None] | None) -> None:
    try:
        if pace:
            pace()
        from app.services.ledger_service import sync_delivery_charge_for_order

        sync_delivery_charge_for_order(order_id, tenant_id)
    except Exception:
        # Charge may not be computable yet; never block a status update.
        logger.exception("Failed to sync delivery charge for order %s", order_id)


def apply_tracking_update(
    shipment: dict,
    tracking: dict,
    *,
    background_tasks: BackgroundTasks | None,
    source: str = "poll",
    charge_pace: Callable[[], None] | None = None,
) -> dict:
    """Record `tracking` on `shipment` and move its order forward if due.

    Returns a summary: {"outcome", "orderStatus" (new, if changed),
    "exception" (if flagged), "closed"}.
    """
    now = _now()
    classified = classify_tracking(tracking.get("status"), tracking.get("statusType"))
    outcome = classified["outcome"]
    closed = classified["closed"]
    tenant_id = str(shipment.get("tenantId") or "")
    summary: dict[str, Any] = {"outcome": outcome, "closed": closed, "orderStatus": None, "exception": None}

    if source == "push" and shipment.get("syncDone"):
        # A late/out-of-order pushed scan for a shipment we already closed.
        summary["outcome"] = "ignored"
        return summary

    # Status fields always move together; descriptive fields only when sent
    # (a pushed scan carries fewer fields than a pull).
    shipment_set: dict[str, Any] = {
        f"tracking.{key}": tracking.get(key)
        for key in ("status", "statusType", "nslCode", "instructions", "statusAt", "location")
    }
    for key in ("destinationPin", "chargedWeightGrams", "orderType", "referenceNo"):
        if tracking.get(key) is not None:
            shipment_set[f"tracking.{key}"] = tracking.get(key)
    shipment_set.update({
        "trackingStatus": tracking.get("status"),
        "trackingOutcome": outcome,
        "lastSyncedAt": now,
        "lastSyncSource": source,
        "lastSyncError": None,
        "updatedAt": now,
    })
    # A pushed scan can arrive out of order; don't let it reopen a closed shipment.
    shipment_filter: dict[str, Any] = {"_id": shipment["_id"]}
    if source == "push":
        shipment_filter["syncDone"] = {"$ne": True}
    if outcome in SHIPMENT_STATUS_FOR:
        shipment_set["status"] = SHIPMENT_STATUS_FOR[outcome]
    if closed:
        shipment_set["syncDone"] = True
        shipment_set["closedAt"] = now
    try:
        shipments.update_one(shipment_filter, {"$set": shipment_set})
    except PyMongoError:
        logger.exception("[SHIPMENT_SYNC] awb=%s status=shipment_write_failed", shipment.get("awb"))

    order_oid = _order_object_id(shipment)
    if order_oid is None or not tenant_id:
        return summary
    order_scope = {"_id": order_oid, "tenantId": tenant_id}
    order_id = str(order_oid)

    # The customer-visible courier line follows tracking, except on cancelled
    # (or otherwise finished) orders, which are left exactly as they are.
    courier_set = {
        "courier.trackingStatus": tracking.get("status"),
        "courier.trackingStatusAt": tracking.get("statusAt"),
    }

    if outcome == "in_transit":
        result = orders.update_one(
            {**order_scope, "orderStatus": {"$in": list(SHIPPED_FROM)}},
            {"$set": {"orderStatus": "shipped", "updatedAt": now, **courier_set}},
        )
        if result.modified_count:
            summary["orderStatus"] = "shipped"
            _notify(background_tasks, order_id, "shipped")
        else:
            _touch_courier(order_scope, courier_set)
        return summary

    if outcome == "delivered":
        order = orders.find_one(
            {**order_scope, "orderStatus": {"$in": list(DELIVERED_FROM)}},
            {"paymentMethod": 1, "paymentStatus": 1, "orderStatus": 1},
        )
        if order:
            status_fields: dict[str, Any] = {
                "orderStatus": "delivered",
                "deliveredAt": now,
                "updatedAt": now,
                "courier.deliveredAt": tracking.get("statusAt"),
                **courier_set,
            }
            # Same rule as PATCH /orders/admin/{id}/status: the courier
            # collected the cash, nothing else ever marks COD paid.
            payment_method = str(order.get("paymentMethod") or "").lower()
            if payment_method in {"cod", "cash_on_delivery"} and order.get("paymentStatus") != "paid":
                status_fields["paymentStatus"] = "paid"
                status_fields["paidAt"] = now
            result = orders.update_one(
                {**order_scope, "orderStatus": order.get("orderStatus")},
                {"$set": status_fields},
            )
            if result.modified_count:
                summary["orderStatus"] = "delivered"
                _notify(background_tasks, order_id, "delivered")
        if summary["orderStatus"] == "delivered" or not shipment.get("syncDone"):
            # First time we see it closed (also when an admin marked the order
            # delivered by hand earlier): the freight can now be computed.
            _sync_delivery_charge(order_id, tenant_id, charge_pace)
        return summary

    if outcome in {"rto", "rto_delivered", "lost", "cancelled"}:
        exception = {
            "type": "rto" if outcome.startswith("rto") else outcome,
            "status": tracking.get("status"),
            "statusType": tracking.get("statusType"),
            "nslCode": tracking.get("nslCode"),
            "instructions": tracking.get("instructions"),
            "courierStatusAt": tracking.get("statusAt"),
            "closed": closed,
            "recordedAt": now,
        }
        result = orders.update_one(
            {**order_scope, "orderStatus": {"$in": list(EXCEPTION_ON)}},
            {
                "$set": {
                    "courier.exception": exception,
                    "courier.needsAttention": True,
                    "updatedAt": now,
                    **courier_set,
                }
            },
        )
        if result.modified_count:
            summary["exception"] = exception["type"]
            logger.warning(
                "[SHIPMENT_SYNC] tenant=%s order=%s awb=%s exception=%s status=%s",
                tenant_id,
                order_id,
                shipment.get("awb"),
                exception["type"],
                tracking.get("status"),
            )
        # Freight is still billed on a completed RTO.
        if outcome == "rto_delivered":
            _sync_delivery_charge(order_id, tenant_id, charge_pace)
        return summary

    # pre_pickup / unknown: only the tracking line changes.
    _touch_courier(order_scope, courier_set)
    return summary


def _touch_courier(order_scope: dict, courier_set: dict) -> None:
    try:
        orders.update_one(
            {**order_scope, "orderStatus": {"$in": list(EXCEPTION_ON)}},
            {"$set": courier_set},
        )
    except PyMongoError:
        logger.exception("[SHIPMENT_SYNC] order=%s status=courier_write_failed", order_scope.get("_id"))


def _notify(background_tasks: BackgroundTasks | None, order_id: str, status: str) -> None:
    try:
        tasks = background_tasks if background_tasks is not None else BackgroundTasks()
        send_order_status_update(tasks, order_id, status)
        if background_tasks is None:
            run_background_tasks(tasks)
    except Exception:
        logger.exception("[SHIPMENT_SYNC] order=%s status=notify_failed event=%s", order_id, status)


def run_background_tasks(tasks: BackgroundTasks) -> None:
    """Run queued FastAPI background tasks now (we are already off the event loop)."""
    for task in list(tasks.tasks):
        try:
            if getattr(task, "is_async", False):
                asyncio.run(task())
            else:
                task.func(*task.args, **task.kwargs)
        except Exception:
            logger.exception("[SHIPMENT_SYNC] background task failed")


def sync_shipment(
    shipment: dict,
    *,
    background_tasks: BackgroundTasks | None,
    service: DelhiveryService | None = None,
    source: str = "poll",
    charge_pace: Callable[[], None] | None = None,
) -> dict:
    """Pull Delhivery tracking for one shipment and apply it.

    Raises DelhiveryError on provider failures (after recording the error on
    the shipment so the batch moves on to other shipments next time).
    """
    awb = str(shipment.get("awb") or "").strip()
    tenant_id = str(shipment.get("tenantId") or "")
    client = service or DelhiveryService()
    try:
        tracking = client.track_shipment(tenant_id, awb)
    except DelhiveryError as error:
        now = _now()
        try:
            shipments.update_one(
                {"_id": shipment["_id"]},
                {
                    "$set": {"lastSyncedAt": now, "lastSyncError": f"{error.code}: {error}"[:300]},
                    "$inc": {"syncFailures": 1},
                },
            )
        except PyMongoError:
            logger.exception("[SHIPMENT_SYNC] awb=%s status=error_write_failed", awb)
        raise
    return apply_tracking_update(
        shipment,
        tracking,
        background_tasks=background_tasks,
        source=source,
        charge_pace=charge_pace,
    )


# --------------------------------------------------------------------------
# Push webhook
# --------------------------------------------------------------------------


def extract_push_shipments(payload: Any) -> list[dict]:
    """Delhivery push body: {"Shipment": {...}} (documented) — also accept a list."""
    items = payload if isinstance(payload, list) else [payload]
    found = []
    for item in items:
        if not isinstance(item, dict):
            continue
        shipment = item.get("Shipment") if isinstance(item.get("Shipment"), dict) else None
        if shipment is None and isinstance(item.get("ShipmentData"), list):
            for inner in item["ShipmentData"]:
                if isinstance(inner, dict) and isinstance(inner.get("Shipment"), dict):
                    found.append(inner["Shipment"])
            continue
        if shipment is not None:
            found.append(shipment)
    return found


def apply_push_update(
    raw_shipment: dict,
    *,
    background_tasks: BackgroundTasks | None,
    service: DelhiveryService | None = None,
) -> dict:
    """Apply one pushed scan. A pushed "delivered" is confirmed by a pull
    first, because it marks COD orders paid."""
    tracking = normalize_tracking_shipment("", raw_shipment)
    awb = str(tracking.get("awb") or "").strip()
    if not awb:
        return {"awb": None, "result": "ignored", "reason": "missing AWB"}
    shipment = shipments.find_one({"provider": PROVIDER, "awb": awb})
    if not shipment:
        return {"awb": awb, "result": "ignored", "reason": "unknown AWB"}
    reference = tracking.get("referenceNo")
    if reference and str(reference) != str(shipment.get("orderId") or ""):
        logger.warning(
            "[SHIPMENT_SYNC] webhook awb=%s reference=%s does not match order=%s",
            awb,
            reference,
            shipment.get("orderId"),
        )
        return {"awb": awb, "result": "ignored", "reason": "reference mismatch"}
    classified = classify_tracking(tracking.get("status"), tracking.get("statusType"))
    if classified["outcome"] == "delivered":
        summary = sync_shipment(
            shipment, background_tasks=background_tasks, service=service, source="push-verified"
        )
    else:
        summary = apply_tracking_update(
            shipment, tracking, background_tasks=background_tasks, source="push"
        )
    return {"awb": awb, "result": "applied", **summary}


# --------------------------------------------------------------------------
# Lease + batch job
# --------------------------------------------------------------------------


def acquire_lease(name: str, owner: str, seconds: int, *, collection=None) -> bool:
    """Atomically take `name` if it is free or expired. True if we hold it."""
    coll = collection if collection is not None else job_locks
    now = _now()
    try:
        doc = coll.find_one_and_update(
            {"_id": name, "$or": [{"expiresAt": {"$lte": now}}, {"expiresAt": {"$exists": False}}]},
            {"$set": {"owner": owner, "acquiredAt": now, "expiresAt": now + timedelta(seconds=seconds)}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        return False  # held by someone else and not expired
    return bool(doc) and doc.get("owner") == owner


def hold_lease_until(name: str, owner: str, until: datetime, *, collection=None) -> None:
    """Keep the lease (only if still ours) until `until` — i.e. the next run."""
    coll = collection if collection is not None else job_locks
    try:
        coll.update_one(
            {"_id": name, "owner": owner},
            {"$set": {"expiresAt": until, "finishedAt": _now()}},
        )
    except PyMongoError:
        logger.exception("[SHIPMENT_SYNC] lease update failed")


class _Pacer:
    def __init__(self, interval: float, sleep: Callable[[float], None]):
        self.interval = interval
        self.sleep = sleep
        self.last = 0.0

    def __call__(self) -> None:
        wait = self.last + self.interval - time.monotonic()
        if wait > 0:
            self.sleep(wait)
        self.last = time.monotonic()


def due_shipments_query(now: datetime | None = None) -> dict:
    cutoff = (now or _now()) - timedelta(days=MAX_SHIPMENT_AGE_DAYS)
    return {
        "provider": PROVIDER,
        "awb": {"$nin": [None, ""]},
        "syncDone": {"$ne": True},
        "createdAt": {"$gte": cutoff},
    }


def run_sync_once(
    *,
    interval_minutes: int | None = None,
    batch_size: int | None = None,
    stop_event: threading.Event | None = None,
    service: DelhiveryService | None = None,
    sleep: Callable[[float], None] = time.sleep,
    owner: str = _OWNER_ID,
    lock_collection=None,
) -> dict:
    """One sync pass. Returns {"ran": bool, ...counts}. Never raises for
    per-shipment failures; a Delhivery 429 ends the pass early."""
    minutes = SHIPMENT_SYNC_MINUTES if interval_minutes is None else interval_minutes
    limit = SHIPMENT_SYNC_BATCH_SIZE if batch_size is None else batch_size
    started = _now()
    if not acquire_lease(LOCK_NAME, owner, LEASE_SECONDS, collection=lock_collection):
        return {"ran": False, "reason": "lease held"}

    stats = {"ran": True, "checked": 0, "shipped": 0, "delivered": 0, "exceptions": 0, "errors": 0}
    # Only the lease holder checks in, so the monitor sees one run per interval
    # however many processes are up.
    max_runtime_minutes = MAX_RUN_SECONDS // 60 + 2
    check_in_id = heartbeat.job_started(
        MONITOR_SLUG,
        interval_minutes=minutes,
        max_runtime_minutes=max_runtime_minutes,
    )
    run_ok = False
    client = service or DelhiveryService()
    track_pace = _Pacer(TRACK_REQUEST_INTERVAL_SECONDS, sleep)
    charge_pace = _Pacer(CHARGE_REQUEST_INTERVAL_SECONDS, sleep)
    clock_start = time.monotonic()
    try:
        cursor = (
            shipments.find(due_shipments_query(started))
            .sort([("lastSyncedAt", 1), ("createdAt", 1)])
            .limit(limit)
        )
        for shipment in cursor:
            if stop_event is not None and stop_event.is_set():
                break
            if time.monotonic() - clock_start > MAX_RUN_SECONDS:
                break
            track_pace()
            stats["checked"] += 1
            try:
                summary = sync_shipment(
                    shipment,
                    background_tasks=None,
                    service=client,
                    charge_pace=charge_pace,
                )
            except DelhiveryError as error:
                stats["errors"] += 1
                if error.code == "RATE_LIMIT":
                    logger.warning("[SHIPMENT_SYNC] Delhivery rate limit hit; ending this run early.")
                    break
                continue
            except Exception:
                stats["errors"] += 1
                logger.exception("[SHIPMENT_SYNC] awb=%s status=failed", shipment.get("awb"))
                continue
            if summary.get("orderStatus") == "shipped":
                stats["shipped"] += 1
            elif summary.get("orderStatus") == "delivered":
                stats["delivered"] += 1
            if summary.get("exception"):
                stats["exceptions"] += 1
        # Per-shipment errors don't fail the run; an exception escaping does.
        run_ok = True
    finally:
        heartbeat.job_finished(
            MONITOR_SLUG,
            check_in_id,
            ok=run_ok,
            duration_seconds=time.monotonic() - clock_start,
            interval_minutes=minutes,
            max_runtime_minutes=max_runtime_minutes,
        )
        # Hold the lease until the next run is due, so several processes
        # still produce one run per interval (and a crash frees it later).
        next_run = max(_now(), started + timedelta(minutes=max(minutes, 1)) - timedelta(seconds=30))
        hold_lease_until(LOCK_NAME, owner, next_run, collection=lock_collection)
    logger.info("[SHIPMENT_SYNC] run finished %s", stats)
    return stats


# --------------------------------------------------------------------------
# Lifespan loop
# --------------------------------------------------------------------------


async def _sync_loop(minutes: int, stop_event: threading.Event) -> None:
    # Let startup finish and spread several processes apart.
    await asyncio.sleep(60 + random.uniform(0, 30))
    wake = max(60.0, minutes * 60 / 3)
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(run_sync_once, interval_minutes=minutes, stop_event=stop_event)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("[SHIPMENT_SYNC] run crashed; will retry next interval")
            alert("shipment_sync.run_crashed", provider="delhivery", error=error)
        await asyncio.sleep(wake + random.uniform(0, 15))


def start_shipment_sync_loop(minutes: int | None = None):
    """Start the background loop. Returns a stop() coroutine function, or None if disabled."""
    interval = SHIPMENT_SYNC_MINUTES if minutes is None else minutes
    if interval <= 0:
        logger.info("[SHIPMENT_SYNC] disabled (SHIPMENT_SYNC_MINUTES=0).")
        return None
    stop_event = threading.Event()
    task = asyncio.create_task(_sync_loop(interval, stop_event), name="delhivery-shipment-sync")

    async def stop() -> None:
        stop_event.set()
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    return stop
