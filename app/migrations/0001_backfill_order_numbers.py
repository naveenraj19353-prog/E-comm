"""Give every order that has no orderNumber a per-store sequential number; copy it onto ledger_entries.

Background: new orders get ``orderNumber`` from the atomic per-store counter
``counters: {_id: "orders:<tenantId>", seq}`` (order_fulfillment.next_order_number,
a single findAndModify ``$inc``). Orders created before that code shipped have
no number.

Design (why numbers go *after* the counter, not before the new ones):

* Numbers already assigned are never changed. They have been shown to
  customers (WhatsApp messages, order pages, packing slips, ledger), so
  renumbering them to make room below is not acceptable.
* The app keeps creating orders while this runs, each taking ``seq + 1``. So
  the backfill reserves its whole block for a store with one atomic
  ``$inc: {seq: N}`` on the same counter document and uses
  ``[seq_after - N + 1 .. seq_after]``. The server serialises ``$inc``s on one
  document, so no concurrent new order can receive a number in that block,
  and the backfill can't receive one a new order already took. No
  read-then-write race, no transaction needed.
* Before reserving, the counter is raised with ``$max`` to at least the
  highest orderNumber already stored for that store (defensive: covers
  orders restored without their counter doc). ``$max`` never lowers it.
* Consequence: for a store that took new orders before this ran, its old
  orders get *higher* numbers than those first few new ones (e.g. new orders
  1..3 exist, 10 old orders become 4..13 in createdAt order). For a store
  with no numbered orders yet, old orders simply become 1..N. Within the
  backfilled block, order is ``createdAt`` then ``_id`` (orders without a
  usable createdAt fall back to the ObjectId timestamp).
* Each order is written with a conditional update (``orderNumber`` still
  null), so the migration never overwrites a number and is idempotent: a
  re-run only picks up orders still missing a number. If it crashes after
  reserving a block, the unused numbers in that block become a gap; a gap is
  harmless (failed inserts in next_order_number already leave gaps) and far
  better than a duplicate.
* Backfilled orders also get ``orderNumberBackfilledAt`` so they can be
  identified later. ``updatedAt`` is intentionally left alone.

ledger_entries written before orderNumber existed get it copied from their
order (conditional on the entry's orderNumber still being null).

Dry run prints, per store: orders missing a number, orders already numbered,
the current counter, the block it would reserve right now, and ledger entries
that would be updated. It writes nothing.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument

MISSING_NUMBER = {"orderNumber": None}  # Mongo: matches missing *or* null
_CHUNK = 500
_FAR_FUTURE = datetime.max.replace(tzinfo=timezone.utc)


def counter_id(tenant_id: str) -> str:
    # Must match order_fulfillment.next_order_number.
    return f"orders:{tenant_id}"


def order_sort_key(doc: dict):
    """createdAt (UTC), then _id. Missing/invalid createdAt -> ObjectId time."""
    created = doc.get("createdAt")
    oid = doc.get("_id")
    if isinstance(created, datetime):
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
    elif isinstance(oid, ObjectId):
        created = oid.generation_time
    else:
        created = _FAR_FUTURE
    tiebreak = (0, oid.binary) if isinstance(oid, ObjectId) else (1, str(oid).encode())
    return (created, tiebreak)


def _as_object_id(value):
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and ObjectId.is_valid(value):
        return ObjectId(value)
    return value


def _max_existing_number(orders, tenant_id: str) -> int:
    cursor = (
        orders.find(
            {"tenantId": tenant_id, "orderNumber": {"$gt": 0}},
            {"orderNumber": 1},
        )
        .sort("orderNumber", -1)
        .limit(1)
    )
    for doc in cursor:
        try:
            return int(doc["orderNumber"])
        except (TypeError, ValueError):
            return 0
    return 0


def backfill_tenant(db, tenant_id: str, *, dry_run: bool, now: datetime) -> dict:
    orders = db["orders"]
    counters = db["counters"]
    pending = list(
        orders.find({"tenantId": tenant_id, **MISSING_NUMBER}, {"_id": 1, "createdAt": 1})
    )
    pending.sort(key=order_sort_key)
    numbered = orders.count_documents({"tenantId": tenant_id, "orderNumber": {"$ne": None}})
    max_existing = _max_existing_number(orders, tenant_id)
    counter = counters.find_one({"_id": counter_id(tenant_id)}) or {}
    counter_seq = int(counter.get("seq") or 0)

    result = {
        "tenantId": tenant_id,
        "missing": len(pending),
        "alreadyNumbered": numbered,
        "counterBefore": counter_seq,
        "maxExistingNumber": max_existing,
        "assigned": 0,
        "firstNumber": None,
        "lastNumber": None,
        "skipped": 0,
    }
    if not pending:
        return result

    if dry_run:
        base = max(counter_seq, max_existing)
        result["firstNumber"] = base + 1
        result["lastNumber"] = base + len(pending)
        return result

    key = counter_id(tenant_id)
    if max_existing > counter_seq:
        counters.update_one({"_id": key}, {"$max": {"seq": max_existing}}, upsert=True)
    reserved = counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": len(pending)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    last = int(reserved["seq"])
    first = last - len(pending) + 1
    result["firstNumber"], result["lastNumber"] = first, last

    for offset, doc in enumerate(pending):
        update = orders.update_one(
            {"_id": doc["_id"], "tenantId": tenant_id, **MISSING_NUMBER},
            {"$set": {"orderNumber": first + offset, "orderNumberBackfilledAt": now}},
        )
        if update.modified_count:
            result["assigned"] += 1
        else:
            # Numbered by someone else meanwhile; its reserved slot stays a gap.
            result["skipped"] += 1
    return result


def backfill_ledger(db, *, dry_run: bool, pending_order_ids: set) -> dict[str, dict]:
    """Copy orderNumber onto ledger entries missing it. Returns per-tenant counts."""
    ledger = db["ledger_entries"]
    orders = db["orders"]
    entries = list(ledger.find(MISSING_NUMBER, {"_id": 1, "orderId": 1, "tenantId": 1}))
    per_tenant: dict[str, dict] = defaultdict(
        lambda: {"missing": 0, "updated": 0, "wouldUpdate": 0, "orderUnnumbered": 0}
    )
    for start in range(0, len(entries), _CHUNK):
        chunk = entries[start : start + _CHUNK]
        ids = list({_as_object_id(e.get("orderId")) for e in chunk if e.get("orderId") is not None})
        numbers = {
            doc["_id"]: doc.get("orderNumber")
            for doc in orders.find({"_id": {"$in": ids}}, {"orderNumber": 1})
        }
        for entry in chunk:
            stats = per_tenant[str(entry.get("tenantId"))]
            stats["missing"] += 1
            order_id = _as_object_id(entry.get("orderId"))
            number = numbers.get(order_id)
            if number is None:
                if dry_run and order_id in pending_order_ids:
                    stats["wouldUpdate"] += 1  # its order gets a number in this run
                else:
                    stats["orderUnnumbered"] += 1
                continue
            if dry_run:
                stats["wouldUpdate"] += 1
                continue
            update = ledger.update_one(
                {"_id": entry["_id"], **MISSING_NUMBER},
                {"$set": {"orderNumber": number}},
            )
            stats["updated"] += update.modified_count
    return dict(per_tenant)


def up(db, *, dry_run: bool = False, log=print, heartbeat=None) -> dict:
    heartbeat = heartbeat or (lambda: None)
    now = datetime.now(timezone.utc)
    orders = db["orders"]

    tenant_ids = sorted(
        t for t in orders.distinct("tenantId", MISSING_NUMBER) if isinstance(t, str) and t
    )
    without_tenant = orders.count_documents({**MISSING_NUMBER, "tenantId": {"$in": [None, ""]}})
    if without_tenant:
        log(f"   WARNING: {without_tenant} order(s) have no tenantId; left unnumbered.")

    pending_order_ids: set = set()
    tenant_results = []
    for tenant_id in tenant_ids:
        heartbeat()
        if dry_run:
            pending_order_ids.update(
                d["_id"] for d in orders.find({"tenantId": tenant_id, **MISSING_NUMBER}, {"_id": 1})
            )
        result = backfill_tenant(db, tenant_id, dry_run=dry_run, now=now)
        tenant_results.append(result)
        verb = "would number" if dry_run else "numbered"
        count = result["missing"] if dry_run else result["assigned"]
        block = (
            f" as {result['firstNumber']}..{result['lastNumber']}"
            if result["firstNumber"] is not None
            else ""
        )
        log(
            f"   {tenant_id}: {verb} {count} order(s){block}; "
            f"already numbered {result['alreadyNumbered']}, counter was {result['counterBefore']}"
            + (f", skipped {result['skipped']}" if result["skipped"] else "")
        )

    heartbeat()
    ledger = backfill_ledger(db, dry_run=dry_run, pending_order_ids=pending_order_ids)
    for tenant_id in sorted(ledger):
        stats = ledger[tenant_id]
        done = stats["wouldUpdate"] if dry_run else stats["updated"]
        log(
            f"   ledger {tenant_id}: {'would set' if dry_run else 'set'} orderNumber on "
            f"{done} of {stats['missing']} entries missing it"
            + (
                f" ({stats['orderUnnumbered']} whose order is missing or unnumbered)"
                if stats["orderUnnumbered"]
                else ""
            )
        )
    if not tenant_ids and not ledger:
        log("   nothing to backfill")

    return {
        "dryRun": dry_run,
        "ordersNumbered": sum(r["assigned"] for r in tenant_results),
        "ordersWithoutTenant": without_tenant,
        "tenants": tenant_results,
        "ledgerUpdated": sum(s["updated"] for s in ledger.values()),
    }
