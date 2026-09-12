"""Open Graph HTML + stable product image for WhatsApp / social crawlers."""

from __future__ import annotations

import html
import logging
import re
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.database.mongo import products, tenants
from app.routes.detail_messages import INVALID_PRODUCT_ID, PRODUCT_NOT_FOUND
from app.services.s3_service import get_object_bytes, is_s3_object_key
from app.services.storefront_url import (
    build_default_og_image_url,
    build_storefront_product_url,
)
from app.utils.product_serialize import sanitize_image_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/og", tags=["Open Graph"])

TENANT_NOT_FOUND = "Tenant not found."


def _first_image_ref(images: object) -> str:
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
    else:
        return ""

    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = sanitize_image_url(value)
        if cleaned:
            return cleaned
    return ""


def _format_inr(amount: float | int | None) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    return f"₹{value:,.0f}"


def _load_tenant_and_product(
    tenant_slug: str,
    product_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    slug = (tenant_slug or "").strip().lower()
    if not slug:
        raise HTTPException(status_code=404, detail=TENANT_NOT_FOUND)
    if not ObjectId.is_valid(product_id):
        raise HTTPException(status_code=400, detail=INVALID_PRODUCT_ID)

    tenant = tenants.find_one({"slug": slug, "isActive": True})
    if not tenant:
        raise HTTPException(status_code=404, detail=TENANT_NOT_FOUND)

    tenant_id = str(tenant.get("tenantId") or tenant.get("slug") or "").strip()
    product = products.find_one(
        {
            "_id": ObjectId(product_id),
            "tenantId": tenant_id,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)

    return tenant, product


def _product_og_payload(
    request: Request,
    tenant: dict[str, Any],
    product: dict[str, Any],
) -> dict[str, str]:
    slug = str(tenant.get("slug") or "").strip().lower()
    product_id = str(product.get("_id"))
    store_name = str(tenant.get("name") or slug or "Store").strip()
    name = str(product.get("name") or "Product").strip()
    price = product.get("finalPrice", product.get("price", 0))
    price_label = _format_inr(price)
    title = f"{name} - {price_label}"
    description = (
        str(product.get("description") or "").strip()
        or f"{name} available now at {store_name}."
    )
    description = re.sub(r"\s+", " ", description)[:220]
    if price_label not in description:
        description = f"{description} · {price_label}".strip(" ·")

    product_url = build_storefront_product_url(slug, product_id)
    api_base = str(request.base_url).rstrip("/")
    image_ref = _first_image_ref(product.get("images"))
    if image_ref:
        image_url = f"{api_base}/og/product/{slug}/{product_id}/image"
    else:
        image_url = build_default_og_image_url()

    return {
        "title": title,
        "description": description,
        "image_url": image_url,
        "product_url": product_url,
        "site_name": store_name,
        "name": name,
        "price_label": price_label,
    }


def _render_product_og_html(payload: dict[str, str]) -> str:
    title = html.escape(payload["title"])
    description = html.escape(payload["description"])
    image_url = html.escape(payload["image_url"])
    product_url = html.escape(payload["product_url"])
    site_name = html.escape(payload["site_name"])
    name = html.escape(payload["name"])
    price_label = html.escape(payload["price_label"])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <link rel="canonical" href="{product_url}" />
  <meta property="og:site_name" content="{site_name}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:image" content="{image_url}" />
  <meta property="og:image:secure_url" content="{image_url}" />
  <meta property="og:url" content="{product_url}" />
  <meta property="og:type" content="product" />
  <meta property="product:price:amount" content="{html.escape(str(payload.get('price_amount', '')))}" />
  <meta property="product:price:currency" content="INR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image" content="{image_url}" />
  <meta http-equiv="refresh" content="0;url={product_url}" />
</head>
<body>
  <p>
    <a href="{product_url}">{name}</a> — {price_label} at {site_name}
  </p>
</body>
</html>
"""


@router.get(
    "/product/{tenant_slug}/{product_id}",
    response_class=HTMLResponse,
)
def product_open_graph(
    tenant_slug: str,
    product_id: str,
    request: Request,
):
    """
    Bot-crawlable HTML for WhatsApp / Facebook / LinkedIn previews.
    Humans are meta-refreshed to the real storefront product URL.
    """
    tenant, product = _load_tenant_and_product(tenant_slug, product_id)
    payload = _product_og_payload(request, tenant, product)
    try:
        payload["price_amount"] = f"{float(product.get('finalPrice', product.get('price', 0))):.2f}"
    except (TypeError, ValueError):
        payload["price_amount"] = "0.00"

    return HTMLResponse(
        content=_render_product_og_html(payload),
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Robots-Tag": "noindex",
        },
    )


@router.get("/product/{tenant_slug}/{product_id}/image")
def product_open_graph_image(
    tenant_slug: str,
    product_id: str,
):
    """
    Stable image URL for og:image (avoids short-lived S3 presigned URLs).
    """
    _tenant, product = _load_tenant_and_product(tenant_slug, product_id)
    image_ref = _first_image_ref(product.get("images"))
    if not image_ref:
        return RedirectResponse(
            url=build_default_og_image_url(),
            status_code=302,
        )

    if image_ref.startswith(("http://", "https://", "data:")):
        return RedirectResponse(url=image_ref, status_code=302)

    if not is_s3_object_key(image_ref):
        return RedirectResponse(
            url=build_default_og_image_url(),
            status_code=302,
        )

    try:
        body, content_type = get_object_bytes(image_ref)
    except RuntimeError:
        logger.exception("Failed to load OG image for product %s", product_id)
        return RedirectResponse(
            url=build_default_og_image_url(),
            status_code=302,
        )

    return Response(
        content=body,
        media_type=content_type or "image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
