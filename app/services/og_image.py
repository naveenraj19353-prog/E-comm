"""Resolve stable share images: tenant banner, then logo, then platform fallback."""

from __future__ import annotations

from typing import Any

from app.database.mongo import banners
from app.services.checkout_service import tenant_id_query
from app.utils.product_serialize import sanitize_image_url


def first_image_ref(images: object) -> str:
    """Return first stored image as S3 key or absolute http(s) URL."""
    if isinstance(images, list):
        values = images
    elif isinstance(images, dict):
        values = []
        for image_list in images.values():
            if isinstance(image_list, list):
                values.extend(image_list)
            elif isinstance(image_list, str):
                values.append(image_list)
    elif isinstance(images, str):
        values = [images]
    else:
        return ""

    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = sanitize_image_url(value)
        if cleaned:
            return cleaned
    return ""


def tenant_share_image_ref(tenant: dict[str, Any] | None) -> str:
    """Prefer the first active home banner, then the store logo."""
    if not tenant:
        return ""
    tenant_id = str(tenant.get("tenantId") or tenant.get("slug") or "").strip()
    if tenant_id:
        banner = banners.find_one(
            {"tenantId": tenant_id_query(tenant_id), "isActive": True},
            sort=[("priority", 1)],
        )
        if banner:
            image = first_image_ref(banner.get("image")) or first_image_ref(
                banner.get("mobileImage")
            )
            if image:
                return image
    return first_image_ref(tenant.get("logo"))
