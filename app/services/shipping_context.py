"""Helpers to resolve tenant Delhivery readiness without exposing tokens."""

from __future__ import annotations

from app.database.mongo import shipping_integrations, shipping_locations
from app.services.delhivery_service import PROVIDER


def get_active_delhivery_context(tenant_id: str) -> dict | None:
    scoped = str(tenant_id or "").strip().lower()
    integration = shipping_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER},
        {
            "enabled": 1,
            "apiTokenEncrypted": 1,
            "pickupLocationName": 1,
        },
    )
    if (
        not integration
        or not integration.get("enabled")
        or not integration.get("apiTokenEncrypted")
    ):
        return None
    location = shipping_locations.find_one(
        {"tenantId": scoped, "provider": PROVIDER, "active": True}
    )
    pickup_name = (
        (location or {}).get("name")
        or integration.get("pickupLocationName")
        or ""
    ).strip()
    if not pickup_name:
        return None
    origin_pin = str((location or {}).get("pincode") or "").strip()
    if len("".join(ch for ch in origin_pin if ch.isdigit())) != 6:
        return None
    return {
        "tenantId": scoped,
        "pickupLocationName": pickup_name,
        "originPin": "".join(ch for ch in origin_pin if ch.isdigit())[:6],
        "location": location,
    }
