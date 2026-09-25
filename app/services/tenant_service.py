"""Shared tenant creation helpers for admin and self-serve registration."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.database.mongo import orders, products, tenants, users
from app.services.billing_service import new_trial_billing
from app.utils.hash import hash_password
from app.utils.phone_normalization import PhoneNormalizationError, normalize_phone
from app.services.store_currency import currency_fields_for_tenant

RESERVED_SLUGS = frozenset(
    {
        "www",
        "admin",
        "api",
        "app",
        "beta",
        "staging",
        "mail",
        "cdn",
        "create-store",
        "login",
        "register",
        "logout",
        "shops",
        "store",
        "stores",
    }
)

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Never returned from any tenant endpoint.
TENANT_SECRET_FIELDS = ("password", "resetToken", "resetTokenExpiry")
TENANT_SECRET_PROJECTION = {field: 0 for field in TENANT_SECRET_FIELDS}

# Tenant documents that have not been deleted.
NOT_DELETED = {"deletedAt": {"$exists": False}}


def strip_tenant_secrets(tenant: dict) -> dict:
    payload = dict(tenant)
    for field in TENANT_SECRET_FIELDS:
        payload.pop(field, None)
    return payload


def tenant_id_in_use(tenant_id: str) -> bool:
    """True if a store, or data left behind by a removed store, uses this tenantId."""
    if tenants.find_one({"tenantId": tenant_id}, {"_id": 1}):
        return True
    return any(
        collection.find_one({"tenantId": tenant_id}, {"_id": 1})
        for collection in (users, orders, products)
    )


def available_tenant_id(slug: str) -> str:
    """Self-serve stores use their slug as tenantId unless an old store already used it."""
    candidate = normalize_slug(slug)
    while tenant_id_in_use(candidate):
        candidate = f"{normalize_slug(slug)}-{secrets.token_hex(3)}"
    return candidate


def normalize_slug(value: str) -> str:
    return value.strip().lower()


def validate_slug(slug: str) -> str:
    normalized = normalize_slug(slug)
    if len(normalized) < 2 or len(normalized) > 48:
        raise HTTPException(
            status_code=400,
            detail="Store URL must be 2–48 characters.",
        )
    if not SLUG_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=400,
            detail="Store URL may only use lowercase letters, numbers, and hyphens.",
        )
    if normalized in RESERVED_SLUGS:
        raise HTTPException(
            status_code=400,
            detail="That store URL is reserved. Please choose another.",
        )
    return normalized


def create_tenant_document(
    *,
    tenant_id: str,
    name: str,
    slug: str,
    email: str,
    password: str,
    business_type: str,
    logo: str = "",
    theme: str = "green",
    phone: str = "",
    display_currency: str = "INR",
    inr_per_unit: float | None = None,
    approval_status: str = "approved",
) -> dict:
    tenant_id = normalize_slug(tenant_id)
    slug = validate_slug(slug)
    name = name.strip()
    email = email.strip().lower()
    business_type = (business_type or "").strip().lower()

    if business_type not in {"retail", "service", "menu"}:
        raise HTTPException(
            status_code=400,
            detail="Business type must be retail, service, or menu.",
        )

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Store name is required.")

    phone = str(phone or "").strip()
    if phone:
        try:
            phone = normalize_phone(phone, country="India")
        except PhoneNormalizationError as error:
            raise HTTPException(
                status_code=400,
                detail="Enter a valid WhatsApp number with country code, for example 9198XXXXXXXX.",
            ) from error

    if tenant_id_in_use(tenant_id):
        raise HTTPException(status_code=400, detail="Tenant ID already exists.")
    if tenants.find_one({"slug": slug}):
        raise HTTPException(
            status_code=400,
            detail="That store URL is already taken.",
        )
    if tenants.find_one({"email": email}):
        raise HTTPException(
            status_code=400,
            detail="That email is already used by another store.",
        )

    now = datetime.now(timezone.utc)
    payload = {
        "tenantId": tenant_id,
        "name": name,
        "slug": slug,
        "businessType": business_type,
        "logo": logo or "",
        "theme": theme or "green",
        "email": email,
        "phone": str(phone or "").strip(),
        "password": hash_password(password),
        "isActive": True,
        "approvalStatus": approval_status,
        # Only stores created from here on get a trial clock; older stores
        # have no `billing` field and stay free (see billing_service).
        "billing": new_trial_billing(now),
        "createdAt": now,
        "updatedAt": now,
    }
    payload.update(
        currency_fields_for_tenant(
            {
                "displayCurrency": display_currency,
                "inrPerUnit": inr_per_unit,
            }
        )
    )
    try:
        result = tenants.insert_one(payload)
    except DuplicateKeyError as error:
        raise HTTPException(
            status_code=400,
            detail="That store ID, URL or email is already taken.",
        ) from error
    response = {
        **payload,
        "_id": str(result.inserted_id),
    }
    return strip_tenant_secrets(response)


def soft_delete_tenant(object_id) -> bool:
    """Retire a store without freeing its tenantId.

    Hard-deleting the tenant document used to let a new store claim the same
    tenantId and inherit the old store's customers and orders. The document is
    kept so tenantId stays taken; slug and email are released for reuse, the
    owner's login is removed and every staff and customer account is disabled.
    """
    tenant = tenants.find_one({"_id": object_id, **NOT_DELETED})
    if not tenant:
        return False
    now = datetime.now(timezone.utc)
    tenants.update_one(
        {"_id": object_id},
        {
            "$set": {
                "isActive": False,
                "deletedAt": now,
                "deletedSlug": tenant.get("slug"),
                "deletedEmail": tenant.get("email"),
                "updatedAt": now,
            },
            "$unset": {
                "slug": "",
                "email": "",
                **{field: "" for field in TENANT_SECRET_FIELDS},
            },
        },
    )
    users.update_many(
        {"tenantId": tenant.get("tenantId")},
        {
            "$set": {"isActive": False, "updatedAt": now},
            "$unset": {"resetToken": "", "resetTokenExpiry": ""},
        },
    )
    return True
