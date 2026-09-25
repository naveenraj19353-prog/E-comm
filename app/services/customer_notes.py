"""Internal notes staff keep about a customer (REQ-065).

Notes are visible only in the admin (never to the customer). Anyone with the
"customers" permission can read and add notes; a note can be deleted by its
author or by the store owner.
"""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId

from app.services.store_permissions import OWNER_ROLES

MAX_NOTE_LENGTH = 1000
NOTES_LIMIT = 100


def build_note(tenant_id: str, customer_id: ObjectId, text: str, user: dict, now: datetime) -> dict:
    return {
        "tenantId": tenant_id,
        "customerId": customer_id,
        "text": text,
        "authorId": str(user.get("userId") or "") or None,
        "authorName": user.get("name") or user.get("email") or "Staff",
        "authorRole": user.get("role"),
        "createdAt": now,
    }


def can_delete_note(note: dict, user: dict) -> bool:
    if user.get("role") in OWNER_ROLES:
        return True
    author = note.get("authorId")
    return bool(author) and author == str(user.get("userId") or "")


def serialize_note(note: dict, user: dict) -> dict:
    created = note.get("createdAt")
    return {
        "id": str(note["_id"]),
        "text": note.get("text") or "",
        "authorName": note.get("authorName") or "Staff",
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else created,
        "canDelete": can_delete_note(note, user),
    }
