"""Shared tenant creation helpers for admin and self-serve registration."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException

from app.database.mongo import tenants
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

    if tenants.find_one({"tenantId": tenant_id}):
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
    result = tenants.insert_one(payload)
    response = {
        **payload,
        "_id": str(result.inserted_id),
    }
    response.pop("password", None)
    return response
