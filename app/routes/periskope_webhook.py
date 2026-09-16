"""Signed, idempotent Periskope webhook receiver."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.config import PERISKOPE_WEBHOOK_SIGNING_KEY
from app.database.mongo import notification_logs, periskope_webhook_events

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)
SUPPORTED_EVENTS = {"message.created"}


def _value(data: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value)
    return None


def _verify_signature(body: bytes, signature: str) -> bool:
    if not PERISKOPE_WEBHOOK_SIGNING_KEY or not signature:
        return False
    digest = hmac.new(
        PERISKOPE_WEBHOOK_SIGNING_KEY.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, signature.strip())


@router.post("/periskope")
async def periskope_webhook(request: Request):
    if not PERISKOPE_WEBHOOK_SIGNING_KEY:
        raise HTTPException(
            status_code=503,
            detail="Periskope webhook signing key is not configured.",
        )

    body = await request.body()
    signature = request.headers.get("x-periskope-signature", "")
    if not _verify_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = str(payload.get("event_type") or "").strip()
    event_data = payload.get("data")
    event_data = event_data if isinstance(event_data, dict) else {}
    event_hash = hashlib.sha256(body).hexdigest()
    message_id = _value(
        event_data,
        "message_id",
        "messageId",
        "unique_id",
        "id",
    )
    linked = (
        notification_logs.find_one({"messageId": message_id})
        if message_id
        else None
    )
    now = datetime.now(timezone.utc)
    document = {
        "eventHash": event_hash,
        "eventType": event_type or "unknown",
        "orgId": _value(payload, "org_id"),
        "messageId": message_id,
        "chatId": _value(event_data, "chat_id", "chatId"),
        "tenantId": (linked or {}).get("tenantId"),
        "notificationId": str(linked["_id"]) if linked else None,
        "providerTimestamp": payload.get("timestamp"),
        "status": "processed" if event_type in SUPPORTED_EVENTS else "ignored",
        "receivedAt": now,
        "processedAt": now,
    }
    try:
        periskope_webhook_events.insert_one(document)
    except DuplicateKeyError:
        return {"success": True, "status": "duplicate"}
    except PyMongoError as error:
        logger.exception("[PERISKOPE_WEBHOOK] status=db_error")
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed.",
        ) from error

    logger.info(
        "[PERISKOPE_WEBHOOK] event=%s status=%s",
        document["eventType"],
        document["status"],
    )
    return {
        "success": True,
        "status": document["status"],
        "event": document["eventType"],
    }
