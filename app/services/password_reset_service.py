from datetime import datetime, timedelta
from typing import Literal

from fastapi import HTTPException

from app.config import FRONTEND_URL
from app.database.mongo import tenants, users

AccountKind = Literal["customer", "admin", "super_admin"]
CollectionName = Literal["users", "tenants"]

RESET_TOKEN_MINUTES = 15


def _normalize_email(email: str) -> str:
    return str(email).strip().lower()


def _normalize_tenant_id(tenant_id: str | None) -> str | None:
    if tenant_id is None:
        return None
    normalized = str(tenant_id).strip().lower()
    return normalized or None


def resolve_reset_account(
    email: str,
    tenant_id: str | None,
) -> dict | None:
    email = _normalize_email(email)
    tenant_id = _normalize_tenant_id(tenant_id)

    if tenant_id is None:
        account = users.find_one(
            {
                "email": email,
                "tenantId": None,
                "role": "super_admin",
                "isActive": True,
            }
        )
        if not account:
            return None
        return {
            "collection": "users",
            "document": account,
            "account_kind": "super_admin",
            "tenant_slug": None,
        }

    tenant_admin = tenants.find_one(
        {
            "tenantId": tenant_id,
            "email": email,
            "isActive": True,
        }
    )
    if tenant_admin:
        return {
            "collection": "tenants",
            "document": tenant_admin,
            "account_kind": "admin",
            "tenant_slug": tenant_admin.get("slug"),
        }

    customer = users.find_one(
        {
            "tenantId": tenant_id,
            "email": email,
            "role": "customer",
            "isActive": True,
        }
    )
    if customer:
        tenant = tenants.find_one({"tenantId": tenant_id, "isActive": True})
        return {
            "collection": "users",
            "document": customer,
            "account_kind": "customer",
            "tenant_slug": tenant.get("slug") if tenant else None,
        }

    return None


def build_reset_link(
    account_kind: AccountKind,
    token: str,
    tenant_slug: str | None = None,
) -> str:
    base = FRONTEND_URL.rstrip("/")
    if account_kind == "customer" and tenant_slug:
        return f"{base}/{tenant_slug}/reset-password?token={token}"
    return f"{base}/admin/reset-password?token={token}"


def save_reset_token(
    collection_name: CollectionName,
    document_id,
    token: str,
    expiry: datetime,
) -> None:
    collection = users if collection_name == "users" else tenants
    collection.update_one(
        {"_id": document_id},
        {
            "$set": {
                "resetToken": token,
                "resetTokenExpiry": expiry,
                "updatedAt": datetime.utcnow(),
            }
        },
    )


def find_account_by_reset_token(token: str) -> dict | None:
    now = datetime.utcnow()
    for collection_name in ("users", "tenants"):
        collection = users if collection_name == "users" else tenants
        document = collection.find_one(
            {
                "resetToken": token,
                "resetTokenExpiry": {"$gt": now},
                "isActive": True,
            }
        )
        if not document:
            continue
        account_kind: AccountKind
        tenant_slug = None
        if collection_name == "tenants":
            account_kind = "admin"
        elif document.get("role") == "super_admin":
            account_kind = "super_admin"
        else:
            account_kind = "customer"
            tenant = tenants.find_one(
                {"tenantId": document.get("tenantId"), "isActive": True}
            )
            tenant_slug = tenant.get("slug") if tenant else None
        return {
            "collection": collection_name,
            "document": document,
            "account_kind": account_kind,
            "tenant_slug": tenant_slug,
        }
    return None


def reset_password_with_token(token: str, new_password: str) -> dict:
    from app.utils.hash import hash_password

    account = find_account_by_reset_token(token)
    if not account:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link.",
        )

    collection_name: CollectionName = account["collection"]
    collection = users if collection_name == "users" else tenants
    document = account["document"]
    now = datetime.utcnow()

    collection.update_one(
        {"_id": document["_id"]},
        {
            "$set": {
                "password": hash_password(new_password),
                "updatedAt": now,
            },
            "$unset": {
                "resetToken": "",
                "resetTokenExpiry": "",
            },
        },
    )

    return {
        "account_kind": account["account_kind"],
        "tenant_slug": account.get("tenant_slug"),
    }


def create_reset_token() -> tuple[str, datetime]:
    from secrets import token_urlsafe

    token = token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_MINUTES)
    return token, expiry
