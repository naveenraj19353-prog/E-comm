"""Resolve the tenant's connected delivery partner from shipping_partners.json."""

from __future__ import annotations

from app.database.mongo import shipping_integrations, shipping_locations
from app.services.shipping_partner_config import (
    default_provider_id,
    list_partner_ids,
)


def get_active_shipping_context(
    tenant_id: str,
    provider: str | None = None,
) -> dict | None:
    scoped = str(tenant_id or "").strip().lower()
    catalog = list_partner_ids(enabled_only=True)
    wanted = str(provider or "").strip().lower()
    preferred = wanted or default_provider_id()
    search_order = []
    if preferred in catalog:
        search_order.append(preferred)
    search_order.extend(item for item in catalog if item not in search_order)

    for partner in search_order:
        context = _context_for_provider(scoped, partner)
        if context:
            return context
    return None


def get_active_delhivery_context(tenant_id: str) -> dict | None:
    return get_active_shipping_context(tenant_id, provider="delhivery")


def _context_for_provider(tenant_id: str, provider: str) -> dict | None:
    integration = shipping_integrations.find_one(
        {"tenantId": tenant_id, "provider": provider},
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
        {"tenantId": tenant_id, "provider": provider, "active": True}
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
        "tenantId": tenant_id,
        "provider": provider,
        "pickupLocationName": pickup_name,
        "originPin": "".join(ch for ch in origin_pin if ch.isdigit())[:6],
        "location": location,
    }
