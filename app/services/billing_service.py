"""Store subscription billing: free trial, then a monthly Razorpay Subscription.

Lifecycle of a store created after billing launched:

    trialing  --(trial ends, no successful charge)-->  past_due
    past_due  --(grace period ends, still unpaid)--->  suspended
    any       --(Razorpay subscription charged)----->  active
    active    --(paid period ends, no renewal)------>  past_due

`suspended` is the only status that takes the storefront offline. The admin
panel is never blocked, so an owner can always subscribe and reactivate.

Stores that existed before billing launched have no `billing` field at all
and are treated as `exempt` (always operational, never billed). A super
admin can also mark any store exempt.

There is no scheduler in this deployment, so deadline transitions are
applied lazily: `ensure_billing_status_current` advances and persists any
elapsed deadline whenever a store's billing status is checked (storefront
load, checkout, admin billing page). Razorpay webhooks move stores to
`active`; everything that moves them *away* from active works even if a
webhook is missed.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.config import (
    RAZORPAY_SUBSCRIPTION_PLAN_ID,
    SUBSCRIPTION_GRACE_DAYS,
    SUBSCRIPTION_PRICE_INR,
    TRIAL_MONTHS,
)
from app.database.mongo import tenants
from app.observability import alert_on_error
from app.services.checkout_service import tenant_id_query
from app.utils.razorpay_client import client

logger = logging.getLogger(__name__)

STORE_UNAVAILABLE_MESSAGE = "This store is temporarily unavailable."
NON_OPERATIONAL_STATUSES = frozenset({"suspended"})
# Razorpay requires a finite cycle count; 120 monthly cycles is ten years.
SUBSCRIPTION_TOTAL_COUNT = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def add_months(value: datetime, months: int) -> datetime:
    """Calendar months, clamping the day (Jan 31 + 1 month -> Feb 28/29)."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def new_trial_billing(now: datetime | None = None) -> dict:
    """The `billing` sub-document every newly created store starts with."""
    now = now or _now()
    return {
        "status": "trialing",
        "trialEndsAt": add_months(now, TRIAL_MONTHS),
        "graceEndsAt": None,
        "currentPeriodEnd": None,
        "razorpaySubscriptionId": None,
        "autopaySetUp": False,
        "cancelledAt": None,
    }


def ensure_billing_status_current(tenant: dict, now: datetime | None = None) -> dict:
    """Advance a store's billing past any deadline that has already elapsed.

    Returns the up-to-date billing dict. Transitions are persisted so the
    grace deadline is fixed the first time it's reached, rather than
    recomputed (and endlessly pushed back) on every call. Idempotent.
    """
    billing = tenant.get("billing")
    if not isinstance(billing, dict):
        return {"status": "exempt"}
    billing = dict(billing)
    status = billing.get("status") or "trialing"
    if status == "exempt":
        return billing

    now = now or _now()
    updates: dict = {}
    grace = timedelta(days=SUBSCRIPTION_GRACE_DAYS)

    if status == "trialing":
        trial_ends_at = _aware(billing.get("trialEndsAt"))
        if trial_ends_at and now >= trial_ends_at:
            status = "past_due"
            billing["graceEndsAt"] = trial_ends_at + grace
            updates["billing.graceEndsAt"] = billing["graceEndsAt"]

    if status == "active":
        period_end = _aware(billing.get("currentPeriodEnd"))
        if period_end and now >= period_end:
            status = "past_due"
            billing["graceEndsAt"] = period_end + grace
            updates["billing.graceEndsAt"] = billing["graceEndsAt"]

    if status == "past_due":
        grace_ends_at = _aware(billing.get("graceEndsAt"))
        if grace_ends_at is None:
            # past_due set by a failed-charge webhook without a deadline.
            billing["graceEndsAt"] = now + grace
            updates["billing.graceEndsAt"] = billing["graceEndsAt"]
        elif now >= grace_ends_at:
            status = "suspended"

    if status != (tenant.get("billing") or {}).get("status"):
        updates["billing.status"] = status
    billing["status"] = status

    if updates and tenant.get("_id") is not None:
        updates["updatedAt"] = now
        tenants.update_one({"_id": tenant["_id"]}, {"$set": updates})
    return billing


def is_store_operational(tenant: dict) -> bool:
    return ensure_billing_status_current(tenant).get("status") not in NON_OPERATIONAL_STATUSES


def assert_store_operational(tenant: dict | None) -> None:
    if tenant and not is_store_operational(tenant):
        raise HTTPException(status_code=402, detail=STORE_UNAVAILABLE_MESSAGE)


def billing_summary(tenant: dict) -> dict:
    """What the store owner / super admin sees. Never sent to shoppers."""
    billing = ensure_billing_status_current(tenant)
    status = billing.get("status") or "exempt"
    now = _now()
    trial_ends_at = _aware(billing.get("trialEndsAt"))
    days_left = None
    if status == "trialing" and trial_ends_at:
        days_left = max(0, (trial_ends_at - now).days)
    return {
        "tenantId": tenant.get("tenantId"),
        "status": status,
        "isOperational": status not in NON_OPERATIONAL_STATUSES,
        "trialEndsAt": trial_ends_at,
        "trialDaysLeft": days_left,
        "graceEndsAt": _aware(billing.get("graceEndsAt")),
        "currentPeriodEnd": _aware(billing.get("currentPeriodEnd")),
        "autopaySetUp": bool(billing.get("autopaySetUp")),
        "cancelledAt": _aware(billing.get("cancelledAt")),
        "priceInr": SUBSCRIPTION_PRICE_INR,
        "billingConfigured": bool(RAZORPAY_SUBSCRIPTION_PLAN_ID),
    }


def find_tenant(tenant_id: str) -> dict:
    tenant = tenants.find_one(
        {"tenantId": tenant_id_query(tenant_id), "deletedAt": {"$exists": False}}
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return tenant


def create_subscription_for_tenant(tenant_id: str) -> dict:
    """Create (or reuse) the Razorpay subscription a store owner authorizes.

    Returns Razorpay's hosted `short_url`, where the owner sets up the
    recurring mandate (UPI Autopay / card). If the store is still in its
    free trial, the first charge is scheduled for the day the trial ends,
    so setting up auto-pay early never costs the owner any trial days.
    """
    if not RAZORPAY_SUBSCRIPTION_PLAN_ID:
        raise HTTPException(
            status_code=503,
            detail="Subscription billing is not configured yet.",
        )
    tenant = find_tenant(tenant_id)
    billing = ensure_billing_status_current(tenant)
    if billing.get("status") == "exempt":
        raise HTTPException(status_code=400, detail="This store is exempt from billing.")

    existing_id = billing.get("razorpaySubscriptionId")
    if existing_id and not billing.get("cancelledAt"):
        try:
            existing = client.subscription.fetch(existing_id)
        except Exception:
            logger.exception("Could not fetch Razorpay subscription %s", existing_id)
            existing = None
        if existing and existing.get("status") in {"created", "authenticated", "active"}:
            return {
                "subscriptionId": existing_id,
                "shortUrl": existing.get("short_url"),
                "status": existing.get("status"),
            }

    payload = {
        "plan_id": RAZORPAY_SUBSCRIPTION_PLAN_ID,
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "quantity": 1,
        "customer_notify": 1,
        "notes": {"tenantId": tenant.get("tenantId")},
    }
    trial_ends_at = _aware(billing.get("trialEndsAt"))
    if billing.get("status") == "trialing" and trial_ends_at and trial_ends_at > _now():
        payload["start_at"] = int(trial_ends_at.timestamp())

    try:
        subscription = client.subscription.create(payload)
    except Exception as error:
        logger.exception("Razorpay subscription create failed for %s", tenant_id)
        raise HTTPException(
            status_code=502,
            detail="Could not start the subscription with Razorpay. Please try again.",
        ) from error

    tenants.update_one(
        {"_id": tenant["_id"]},
        {
            "$set": {
                "billing.razorpaySubscriptionId": subscription["id"],
                "billing.cancelledAt": None,
                "updatedAt": _now(),
            }
        },
    )
    return {
        "subscriptionId": subscription["id"],
        "shortUrl": subscription.get("short_url"),
        "status": subscription.get("status"),
    }


def set_billing_exempt(tenant_id: str, exempt: bool) -> dict:
    """Super-admin override: waive billing for a store, or put it back on it.

    Taking a store off exemption starts it in `past_due` with a fresh grace
    period rather than a new free trial, so this can't be used to reset a
    trial over and over.
    """
    tenant = find_tenant(tenant_id)
    now = _now()
    if exempt:
        update = {"billing.status": "exempt", "billing.graceEndsAt": None}
    else:
        current = tenant.get("billing") if isinstance(tenant.get("billing"), dict) else {}
        update = {
            "billing.status": "past_due",
            "billing.graceEndsAt": now + timedelta(days=SUBSCRIPTION_GRACE_DAYS),
            "billing.trialEndsAt": current.get("trialEndsAt"),
            "billing.currentPeriodEnd": current.get("currentPeriodEnd"),
            "billing.razorpaySubscriptionId": current.get("razorpaySubscriptionId"),
            "billing.autopaySetUp": bool(current.get("autopaySetUp")),
        }
    update["updatedAt"] = now
    tenants.update_one({"_id": tenant["_id"]}, {"$set": update})
    return billing_summary(tenants.find_one({"_id": tenant["_id"]}) or tenant)


@alert_on_error("billing.webhook_failed", provider="razorpay")
def handle_subscription_event(payload: dict) -> dict:
    """Apply a verified Razorpay `subscription.*` webhook to the store."""
    event = str(payload.get("event") or "")
    entity = (payload.get("payload") or {}).get("subscription", {}).get("entity") or {}
    subscription_id = entity.get("id")
    if not subscription_id:
        return {"success": True, "status": "ignored", "reason": "missing subscription id"}

    tenant = tenants.find_one({"billing.razorpaySubscriptionId": subscription_id})
    if not tenant:
        return {"success": True, "status": "ignored", "reason": "unknown subscription"}

    now = _now()
    updates: dict = {"updatedAt": now}
    current = tenant.get("billing") if isinstance(tenant.get("billing"), dict) else {}
    exempt = current.get("status") == "exempt"

    if event == "subscription.authenticated":
        updates["billing.autopaySetUp"] = True
    elif event in {"subscription.activated", "subscription.charged"}:
        updates["billing.autopaySetUp"] = True
        current_end = entity.get("current_end")
        period_end = (
            datetime.fromtimestamp(int(current_end), timezone.utc)
            if current_end
            else add_months(now, 1)
        )
        updates["billing.currentPeriodEnd"] = period_end
        if not exempt:
            updates["billing.status"] = "active"
            updates["billing.graceEndsAt"] = None
    elif event in {"subscription.pending", "subscription.halted"}:
        # A charge failed (pending = Razorpay is retrying, halted = gave up).
        # Keep an existing grace deadline; don't extend it on every retry.
        if not exempt and current.get("status") != "suspended":
            updates["billing.status"] = "past_due"
            if not current.get("graceEndsAt"):
                updates["billing.graceEndsAt"] = now + timedelta(days=SUBSCRIPTION_GRACE_DAYS)
    elif event in {"subscription.cancelled", "subscription.completed"}:
        # The store keeps whatever it already paid for; the normal
        # period-end -> past_due -> suspended path takes it from there.
        updates["billing.cancelledAt"] = now
        updates["billing.autopaySetUp"] = False
    else:
        return {"success": True, "status": "ignored", "event": event}

    tenants.update_one({"_id": tenant["_id"]}, {"$set": updates})
    return {
        "success": True,
        "status": "processed",
        "event": event,
        "tenantId": tenant.get("tenantId"),
    }


def billing_overview(*, page: int = 1, page_size: int = 25) -> dict:
    """Every store's billing status, for the super-admin billing screen."""
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    query = {"deletedAt": {"$exists": False}}
    total = tenants.count_documents(query)
    cursor = (
        tenants.find(query, {"tenantId": 1, "name": 1, "slug": 1, "billing": 1, "createdAt": 1})
        .sort("createdAt", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    rows = []
    for tenant in cursor:
        rows.append(
            {
                **billing_summary(tenant),
                "name": tenant.get("name"),
                "slug": tenant.get("slug"),
            }
        )
    return {"rows": rows, "page": page, "pageSize": page_size, "total": total}
