import re
from typing import Any

from fastapi import HTTPException

def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _dynamic_code(value: Any, *, length: int, fallback: str) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return fallback

    words = re.findall(r"[a-z0-9]+", cleaned.lower())
    if not words:
        return fallback

    compact = "".join(words)
    if compact.isdigit():
        return compact.upper()

    return compact[:length].upper() or fallback


def abbreviate_brand(value: Any) -> str:
    return _dynamic_code(value, length=2, fallback="GEN")


def abbreviate_product_type(value: Any) -> str:
    return _dynamic_code(value, length=4, fallback="GEN")


def abbreviate_color(value: Any) -> str:
    return _dynamic_code(value, length=3, fallback="UNK")


def abbreviate_size(value: Any) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return "OS"
    if cleaned.lower() == "one size":
        return "OS"
    return re.sub(r"[^a-zA-Z0-9]+", "", cleaned).upper() or "OS"


def generate_variant_sku(brand: Any, product_type: Any, color: Any, size: Any) -> str:
    brand_code = abbreviate_brand(brand)
    type_code = abbreviate_product_type(product_type)
    color_code = abbreviate_color(color)
    size_code = abbreviate_size(size)
    return f"{brand_code}-{type_code}-{color_code}-{size_code}"


def _variant_key_for_lookup(value: Any) -> tuple[str, str]:
    color = _clean_text(value.get("color") if isinstance(value, dict) else value)
    size = _clean_text(value.get("size") if isinstance(value, dict) else value)
    return (color.lower(), size.lower())


def assign_variant_ids_for_inventory(
    product: dict[str, Any],
    inventory: list[dict[str, Any]],
    *,
    existing_inventory: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    existing_lookup: dict[tuple[str, str], str] = {}
    for item in existing_inventory or []:
        if not isinstance(item, dict):
            continue
        key = _variant_key_for_lookup(item)
        variant_id = str(item.get("variantId") or "").strip()
        if key and variant_id:
            existing_lookup[key] = variant_id

    prepared: list[dict[str, Any]] = []
    for item in inventory:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        color = _clean_text(item.get("color"))
        size = _clean_text(item.get("size"))
        key = (color.lower(), size.lower())
        existing_variant_id = existing_lookup.get(key)
        if existing_variant_id:
            item["variantId"] = existing_variant_id
        else:
            item["variantId"] = generate_variant_sku(
                product.get("brand"),
                product.get("categoryName") or product.get("categoryId"),
                color,
                size,
            )
        prepared.append(item)
    return prepared


def ensure_unique_variant_ids_for_tenant(
    tenant_id: str,
    inventory: list[dict[str, Any]],
    *,
    products_collection,
    ignore_product_id: str | None = None,
) -> None:
    if not tenant_id:
        return

    existing = list(
        products_collection.find(
            {"tenantId": tenant_id},
            {"_id": 1, "inventory": 1},
        )
    )
    current_variant_ids: set[str] = set()
    for product in existing:
        if ignore_product_id and str(product.get("_id")) == str(ignore_product_id):
            continue
        for item in product.get("inventory") or []:
            if not isinstance(item, dict):
                continue
            variant_id = str(item.get("variantId") or "").strip()
            if variant_id:
                current_variant_ids.add(variant_id)

    for item in inventory:
        if not isinstance(item, dict):
            continue
        variant_id = str(item.get("variantId") or "").strip()
        if not variant_id:
            continue
        if variant_id in current_variant_ids:
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate variantId: {variant_id}. This SKU already exists in this tenant.",
            )
        current_variant_ids.add(variant_id)
