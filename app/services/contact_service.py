from datetime import datetime, timedelta, timezone
import re

from bson import ObjectId
from fastapi import HTTPException

from app.database.mongo import contact_messages, tenants

RATE_LIMIT = 5
RATE_WINDOW = timedelta(hours=1)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_contact(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name") or "",
        "email": doc.get("email") or "",
        "phone": doc.get("phone") or "",
        "message": doc.get("message") or "",
        "status": doc.get("status") or "new",
        "createdAt": doc.get("createdAt"),
        "readAt": doc.get("readAt"),
    }


def _active_tenant_id(tenant_id: str) -> str:
    scoped = str(tenant_id or "").strip().lower()
    if not scoped:
        raise HTTPException(status_code=400, detail="Store is required.")
    tenant = tenants.find_one({"tenantId": scoped, "isActive": True}, {"tenantId": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Store not found.")
    return scoped


def create_contact_message(
    *,
    tenant_id: str,
    name: str,
    email: str,
    phone: str,
    message: str,
) -> dict:
    scoped = _active_tenant_id(tenant_id)
    clean_name = str(name or "").strip()
    clean_email = str(email or "").strip().lower()
    clean_phone = "".join(ch for ch in str(phone or "") if ch.isdigit())[-10:]
    clean_message = str(message or "").strip()
    if len(clean_name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    if not EMAIL_RE.match(clean_email):
        raise HTTPException(status_code=400, detail="Please enter a valid email.")
    if len(clean_message) < 10:
        raise HTTPException(status_code=400, detail="Please enter a longer message.")
    since = _now() - RATE_WINDOW
    recent = contact_messages.count_documents(
        {
            "tenantId": scoped,
            "email": clean_email,
            "createdAt": {"$gte": since},
        }
    )
    if recent >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="You already sent a few messages. Please try again later.",
        )
    now = _now()
    payload = {
        "tenantId": scoped,
        "name": clean_name[:80],
        "email": clean_email[:120],
        "phone": clean_phone,
        "message": clean_message[:2000],
        "status": "new",
        "createdAt": now,
        "readAt": None,
    }
    result = contact_messages.insert_one(payload)
    payload["_id"] = result.inserted_id
    return payload


def list_contact_messages(tenant_id: str) -> list[dict]:
    scoped = str(tenant_id or "").strip().lower()
    cursor = contact_messages.find({"tenantId": scoped}).sort("createdAt", -1)
    return [serialize_contact(item) for item in cursor]


def mark_contact_read(*, message_id: str, tenant_id: str) -> dict:
    if not ObjectId.is_valid(message_id):
        raise HTTPException(status_code=400, detail="Invalid message ID.")
    scoped = str(tenant_id or "").strip().lower()
    doc = contact_messages.find_one(
        {"_id": ObjectId(message_id), "tenantId": scoped}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found.")
    if doc.get("status") != "read":
        now = _now()
        contact_messages.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "read", "readAt": now}},
        )
        doc["status"] = "read"
        doc["readAt"] = now
    return serialize_contact(doc)
