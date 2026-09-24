import re
from typing import Any

from fastapi import HTTPException

BRAND_ABBREVIATIONS = {
    "nike": "NK",
    "adidas": "AD",
    "puma": "PM",
    "reebok": "RB",
    "levi": "LV",
    "levis": "LV",
    "zara": "ZR",
    "h&m": "HM",
    "h and m": "HM",
    "generic": "GEN",
    "unbranded": "GEN",
}

PRODUCT_TYPE_ABBREVIATIONS = {
    "t-shirt": "TS",
    "t shirt": "TS",
    "shirt": "SHT",
    "jeans": "JNS",
    "dress": "DRS",
    "shoes": "SHO",
    "sneakers": "SNR",
    "sandal": "SDL",
    "sandals": "SDL",
    "track-pant": "TPN",
    "track pant": "TPN",
    "pants": "PNT",
    "trouser": "TRS",
    "trousers": "TRS",
    "kurta": "KRT",
    "saree": "SRE",
    "top": "TOP",
    "blazer": "BLZ",
    "coat": "COT",
    "jacket": "JKT",
    "hoodie": "HDI",
    "sweater": "SWT",
    "shorts": "SRT",
    "cap": "CAP",
    "hat": "HAT",
    "watch": "WAT",
    "bag": "BAG",
    "wallet": "WLT",
    "perfume": "PRF",
    "belt": "BLT",
    "slippers": "SLP",
    "flip-flops": "FFP",
    "flip flops": "FFP",
    "one size": "OS",
    "service": "SRV",
    "menu item": "MNU",
}

COLOR_ABBREVIATIONS = {
    "black": "BLK",
    "white": "WHT",
    "red": "RED",
    "blue": "BLU",
    "green": "GRN",
    "yellow": "YEL",
    "orange": "ORG",
    "purple": "PUR",
    "pink": "PNK",
    "grey": "GRY",
    "gray": "GRY",
    "brown": "BRN",
    "beige": "BEG",
    "navy": "NVY",
    "silver": "SLV",
    "gold": "GLD",
    "maroon": "MRN",
    "olive": "OLV",
    "teal": "TEL",
    "cream": "CRM",
    "peach": "PEC",
    "indigo": "IND",
    "wine": "WNE",
    "charcoal": "CHL",
    "tan": "TAN",
}

SIZE_ABBREVIATIONS = {
    "xs": "XS",
    "s": "S",
    "m": "M",
    "l": "L",
    "xl": "XL",
    "xxl": "XXL",
    "xxxl": "XXXL",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    "10": "10",
    "11": "11",
    "12": "12",
    "one size": "OS",
    "os": "OS",
    "standard": "STD",
    "default": "DEF",
}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _normalize_key(value: Any) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return ""
    return cleaned.lower().replace("&", " and ").replace("_", " ")


def _apply_mapping(value: Any, mapping: dict[str, str], fallback: str) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return fallback

    key = _normalize_key(cleaned)
    direct = mapping.get(key)
    if direct:
        return direct

    normalized_phrase = re.sub(r"[^a-z0-9]+", "-", key).strip("-")
    if normalized_phrase and normalized_phrase in mapping:
        return mapping[normalized_phrase]

    parts = [part for part in re.split(r"[^a-z0-9]+", key) if part]
    if not parts:
        return fallback
    derived = []
    for part in parts:
        if part in mapping:
            derived.append(mapping[part])
        else:
            derived.append(part[:1].upper())
    composed = "".join(derived)
    if composed:
        return composed[:6].upper() if len(composed) > 6 else composed.upper()
    return fallback


def abbreviate_brand(value: Any) -> str:
    return _apply_mapping(value, BRAND_ABBREVIATIONS, "GEN")


def abbreviate_product_type(value: Any) -> str:
    return _apply_mapping(value, PRODUCT_TYPE_ABBREVIATIONS, "GEN")


def abbreviate_color(value: Any) -> str:
    return _apply_mapping(value, COLOR_ABBREVIATIONS, "UNK")


def abbreviate_size(value: Any) -> str:
    return _apply_mapping(value, SIZE_ABBREVIATIONS, "OS")


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
