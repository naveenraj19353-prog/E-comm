from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database.mongo import audit_logs

_SENSITIVE_KEYS = {
    "password",
    "token",
    "secret",
    "apiKey",
    "accessToken",
    "refreshToken",
}


def _safe_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _safe_value(item)
            for key, item in value.items()
            if str(key) not in _SENSITIVE_KEYS
        }
    if isinstance(value, (list, tuple)):
        return [_safe_value(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "__str__") and value.__class__.__name__ == "ObjectId":
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _actor(user: dict | None) -> dict:
    user = user or {}
    return {
        "userId": str(user.get("userId") or "") or None,
        "name": str(user.get("name") or "").strip() or None,
        "email": str(user.get("email") or "").strip() or None,
        "role": str(user.get("role") or "").strip() or None,
    }


def record_audit_event(
    *,
    action: str,
    actor: dict | None,
    tenant_id: str | None = None,
    entity_type: str,
    entity_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    metadata: dict | None = None,
) -> None:
    audit_logs.insert_one(
        {
            "tenantId": str(tenant_id or "").strip().lower() or None,
            "action": action,
            "actor": _actor(actor),
            "entity": {
                "type": entity_type,
                "id": str(entity_id or "").strip() or None,
            },
            "before": _safe_value(before) if before is not None else None,
            "after": _safe_value(after) if after is not None else None,
            "metadata": _safe_value(metadata or {}),
            "createdAt": datetime.now(timezone.utc),
        }
    )
