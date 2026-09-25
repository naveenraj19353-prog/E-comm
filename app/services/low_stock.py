"""Low-stock threshold and alerts (REQ-035).

Each store has `lowStockThreshold` (default 5, 0 = off). A variant is "low"
when its stock is at or below the threshold. When a sale, checkout hold or
manual adjustment takes a variant from above the threshold to at/below it,
the store's WhatsApp numbers get one message (sent in the background so the
customer's checkout is never slowed down). Every alert is recorded in
`notification_logs` with eventType "stock.low".
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DEFAULT_LOW_STOCK_THRESHOLD = 5
MAX_LOW_STOCK_THRESHOLD = 100_000
LOW_STOCK_LIST_LIMIT = 200


def tenant_threshold(tenant: dict | None) -> int:
    value = (tenant or {}).get("lowStockThreshold")
    if value is None:
        return DEFAULT_LOW_STOCK_THRESHOLD
    try:
        number = int(value)
    except (TypeError, ValueError):
        return DEFAULT_LOW_STOCK_THRESHOLD
    return max(0, min(number, MAX_LOW_STOCK_THRESHOLD))


def crossed_threshold(stock_before: int, stock_after: int, threshold: int) -> bool:
    """True only on the step that goes from above the threshold to at/below it."""
    return threshold > 0 and stock_before > threshold >= stock_after


def variant_label(variant: dict) -> str:
    parts = [str(variant.get(key)).strip() for key in ("color", "size") if variant.get(key)]
    return " / ".join(part for part in parts if part) or str(variant.get("variantId") or "")


def low_stock_message(store_name: str, product_name: str, variant: dict, stock: int, threshold: int) -> str:
    state = "is now OUT OF STOCK" if stock <= 0 else f"is low: {stock} left"
    label = variant_label(variant)
    item = f"{product_name} ({label})" if label else product_name
    return (
        "⚠️ *LOW STOCK*\n"
        f"{item} {state}.\n"
        f"Alert level: {threshold}.\n"
        f"Restock from the admin panel: Products → Stock.\n"
        f"— {store_name}"
    )


def low_stock_items(products_docs, threshold: int) -> list[dict]:
    """Group low/out-of-stock variants by product for the admin list."""
    items: list[dict] = []
    for product in products_docs:
        variants = []
        for variant in product.get("inventory") or []:
            try:
                stock = int(variant.get("stock", 0) or 0)
            except (TypeError, ValueError):
                stock = 0
            if stock <= threshold:
                variants.append(
                    {
                        "variantId": str(variant.get("variantId") or ""),
                        "color": variant.get("color"),
                        "size": variant.get("size"),
                        "stock": stock,
                    }
                )
        if variants:
            variants.sort(key=lambda row: row["stock"])
            items.append(
                {
                    "productId": str(product.get("_id")),
                    "name": product.get("name"),
                    "variants": variants,
                    "lowestStock": variants[0]["stock"],
                }
            )
    items.sort(key=lambda row: (row["lowestStock"], str(row["name"] or "")))
    return items


def low_stock_query(tenant_id: str, threshold: int) -> dict:
    return {
        "tenantId": tenant_id,
        "isActive": {"$ne": False},
        "inventory": {"$elemMatch": {"stock": {"$lte": threshold}}},
    }


def _send_low_stock_alert(tenant_id: str, product: dict, variant: dict, stock: int, threshold: int) -> None:
    # Imported here: the WhatsApp service pulls in a lot, and this module is
    # imported by order fulfilment and unit tests.
    from app.database.mongo import notification_logs, tenants
    from app.services.periskope_service import PeriskopeService
    from app.services.whatsapp_notification_service import (
        PROVIDER,
        _deliver_whatsapp,
        _integration_for_tenant,
        _tenant_notify_phones,
    )
    from app.utils.phone_normalization import mask_phone

    now = datetime.now(timezone.utc)
    log = {
        "idempotencyKey": f"stock-low:{tenant_id}:{product.get('_id')}:{variant.get('variantId')}:{now.isoformat()}",
        "provider": PROVIDER,
        "tenantId": tenant_id,
        "eventType": "stock.low",
        "audience": "tenant",
        "productId": str(product.get("_id")),
        "variantId": str(variant.get("variantId") or ""),
        "stock": stock,
        "threshold": threshold,
        "attempts": 1,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        integration = _integration_for_tenant(tenant_id)
        if integration is not None and not integration.get("enabled"):
            log.update(status="skipped", error="WhatsApp notifications are turned off for this store.")
            notification_logs.insert_one(log)
            return
        phones = _tenant_notify_phones(tenant_id, integration)
        if not phones:
            log.update(status="skipped", error="Store WhatsApp number is missing.")
            notification_logs.insert_one(log)
            return
        tenant = tenants.find_one({"tenantId": tenant_id}, {"name": 1}) or {}
        message = low_stock_message(
            tenant.get("name") or "Your store",
            product.get("name") or "A product",
            variant,
            stock,
            threshold,
        )
        service = PeriskopeService()
        for phone in phones:
            _deliver_whatsapp(service, phone, message)
        log.update(status="sent", phone=mask_phone(phones[0]))
    except Exception as error:  # never let an alert break anything
        logger.exception("[WHATSAPP] tenant=%s event=stock.low status=failed", tenant_id)
        log.update(status="failed", error=str(error)[:300])
    try:
        notification_logs.insert_one(log)
    except Exception:
        logger.exception("Could not record low-stock alert for tenant %s", tenant_id)


def maybe_alert_low_stock(
    tenant_id: str,
    product: dict,
    variant_id: str,
    stock_after: int | None,
    change: int,
    tenant: dict | None = None,
    *,
    run_in_background: bool = True,
) -> bool:
    """Send a low-stock alert if this change crossed the threshold. Returns True if one was started."""
    if stock_after is None or change >= 0:
        return False
    try:
        if tenant is None:
            from app.database.mongo import tenants

            tenant = tenants.find_one({"tenantId": tenant_id}, {"lowStockThreshold": 1})
        threshold = tenant_threshold(tenant)
        if not crossed_threshold(stock_after - change, stock_after, threshold):
            return False
        variant = next(
            (item for item in product.get("inventory") or [] if str(item.get("variantId")) == str(variant_id)),
            {"variantId": variant_id},
        )
        args = (tenant_id, product, variant, stock_after, threshold)
        if run_in_background:
            threading.Thread(target=_send_low_stock_alert, args=args, daemon=True).start()
        else:
            _send_low_stock_alert(*args)
        return True
    except Exception:
        logger.exception("Low-stock check failed for tenant %s", tenant_id)
        return False
