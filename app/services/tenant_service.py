"""Shared tenant creation helpers for admin and self-serve registration."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException

from app.database.mongo import tenants
from app.utils.hash import hash_password

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
    logo: str = "",
    theme: str = "green",
) -> dict:
    tenant_id = normalize_slug(tenant_id)
    slug = validate_slug(slug)
    name = name.strip()
    email = email.strip().lower()

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Store name is required.")

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
        "logo": logo or "",
        "theme": theme or "green",
        "email": email,
        "password": hash_password(password),
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    result = tenants.insert_one(payload)
    response = {
        **payload,
        "_id": str(result.inserted_id),
    }
    response.pop("password", None)
    return response
