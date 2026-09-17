"""Tenant-scoped Periskope settings and safe operational endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from app.config import (
    PERISKOPE_API_KEY,
    PERISKOPE_PHONE,
    PERISKOPE_WEBHOOK_SIGNING_KEY,
)
from app.database.mongo import messaging_integrations, notification_logs
from app.models.periskope import PeriskopeSettingsUpdate
from app.services.periskope_service import PeriskopeError, PeriskopeService
from app.services.whatsapp_notification_service import (
    DEFAULT_NOTIFICATIONS,
    retry_notification,
)
from app.utils.auth_dependencies import admin_tenant_id, require_admin
from app.utils.phone_normalization import (
    PhoneNormalizationError,
    mask_phone,
    normalize_phone,
)

router = APIRouter(prefix="/integrations/periskope", tags=["Periskope"])
PROVIDER = "periskope"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalized_notify_phone(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return normalize_phone(raw, country="India")
    except PhoneNormalizationError as error:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid store WhatsApp number with country code, for example 9198XXXXXXXX.",
        ) from error


def _public_settings(doc: dict | None) -> dict:
    configured = bool(PERISKOPE_API_KEY and PERISKOPE_PHONE)
    notify_phone = str((doc or {}).get("notifyPhone") or "").strip()
    return {
        "provider": PROVIDER,
        "enabled": bool((doc or {}).get("enabled")),
        "connected": configured,
        "senderPhone": mask_phone(PERISKOPE_PHONE),
        "notifyPhone": notify_phone,
        "webhookEnabled": bool((doc or {}).get("webhookEnabled", True)),
        "webhookConfigured": bool(PERISKOPE_WEBHOOK_SIGNING_KEY),
        "notifications": {
            **DEFAULT_NOTIFICATIONS,
            **((doc or {}).get("notifications") or {}),
        },
        "updatedAt": (doc or {}).get("updatedAt"),
        "createdAt": (doc or {}).get("createdAt"),
    }


@router.get("/settings")
def get_settings(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    doc = messaging_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER}
    )
    return {"success": True, "data": _public_settings(doc)}


@router.put("/settings")
def save_settings(
    body: PeriskopeSettingsUpdate,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    if body.enabled and not (PERISKOPE_API_KEY and PERISKOPE_PHONE):
        raise HTTPException(
            status_code=400,
            detail="Configure Periskope credentials on the backend before enabling WhatsApp.",
        )

    existing = messaging_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER}
    )
    now = _now()
    payload = {
        "tenantId": scoped,
        "provider": PROVIDER,
        "enabled": body.enabled,
        "webhookEnabled": body.webhookEnabled,
        "notifyPhone": _normalized_notify_phone(body.notifyPhone),
        "notifications": body.notifications.model_dump(),
        "updatedAt": now,
    }
    if not existing:
        payload["createdAt"] = now
    try:
        messaging_integrations.update_one(
            {"tenantId": scoped, "provider": PROVIDER},
            {"$set": payload},
            upsert=True,
        )
    except PyMongoError as error:
        raise HTTPException(
            status_code=500,
            detail="Failed to save WhatsApp settings.",
        ) from error
    saved = messaging_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER}
    )
    return {
        "success": True,
        "message": "WhatsApp settings saved.",
        "data": _public_settings(saved),
    }


@router.post("/test")
def test_connection(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    admin_tenant_id(current_user, tenant_id)
    try:
        PeriskopeService().health_check()
    except PeriskopeError as error:
        raise HTTPException(
            status_code=400,
            detail="Unable to connect to Periskope.",
        ) from error
    return {"success": True, "message": "Periskope connection successful."}


@router.get("/notifications")
def list_notifications(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    rows = []
    for item in notification_logs.find(
        {"tenantId": scoped, "provider": PROVIDER}
    ).sort(
        "createdAt", DESCENDING
    ).limit(limit):
        rows.append(
            {
                "id": str(item["_id"]),
                "eventType": item.get("eventType"),
                "orderId": item.get("orderId"),
                "productId": item.get("productId"),
                "phone": item.get("phone") or "",
                "status": item.get("status"),
                "attempts": item.get("attempts", 0),
                "messageId": item.get("messageId"),
                "error": item.get("error"),
                "createdAt": item.get("createdAt"),
                "updatedAt": item.get("updatedAt"),
            }
        )
    return {"success": True, "data": rows}


@router.post("/notifications/{notification_id}/retry")
def retry_failed_notification(
    notification_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    if not retry_notification(
        background_tasks,
        notification_id=notification_id,
        tenant_id=scoped,
    ):
        raise HTTPException(
            status_code=404,
            detail="Retryable notification not found.",
        )
    return {"success": True, "message": "Notification retry scheduled."}
