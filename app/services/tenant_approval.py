from __future__ import annotations

from typing import Any

APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_SUSPENDED = "suspended"


def approval_status(tenant: dict[str, Any]) -> str:
    value = str(tenant.get("approvalStatus") or "").strip().lower()
    if value in {APPROVAL_PENDING, APPROVAL_SUSPENDED}:
        return value
    return APPROVAL_APPROVED


def is_storefront_approved(tenant: dict[str, Any]) -> bool:
    return approval_status(tenant) == APPROVAL_APPROVED


def is_management_accessible(tenant: dict[str, Any]) -> bool:
    return approval_status(tenant) != APPROVAL_SUSPENDED
