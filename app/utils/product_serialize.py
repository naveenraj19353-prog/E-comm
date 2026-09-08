from datetime import datetime


AUTO_FORMAT_QUERY = "?auto=format"
UNSPLASH_BASE_URL = "https://images.unsplash.com/"
UNSPLASH_DUPLICATE_PREFIX = f"{UNSPLASH_BASE_URL}https://"


def sanitize_image_url(url: str | None) -> str:
    """Fix malformed Unsplash URLs (e.g. double https://images.unsplash.com/ prefix)."""
    value = (url or "").strip()
    if not value:
        return ""

    while value.startswith(UNSPLASH_DUPLICATE_PREFIX):
        value = value[len(UNSPLASH_BASE_URL) :]

    if value.count(AUTO_FORMAT_QUERY) > 1:
        first, remainder = value.split(AUTO_FORMAT_QUERY, 1)
        query, _extra = remainder.split(AUTO_FORMAT_QUERY, 1)
        value = f"{first}{AUTO_FORMAT_QUERY}{query}"

    return value


def _normalize_image_list(images: list) -> list[str]:
    normalized = []
    for item in images:
        if not isinstance(item, str):
            continue
        cleaned = sanitize_image_url(item)
        if cleaned:
            normalized.append(cleaned)
    return normalized


def _normalize_color_images(image_list: object) -> list[str]:
    if isinstance(image_list, str):
        cleaned = sanitize_image_url(image_list)
        return [cleaned] if cleaned else []
    if isinstance(image_list, list):
        return _normalize_image_list(image_list)
    return []


def normalize_product_images(images: dict | list | None) -> dict[str, list[str]]:
    if isinstance(images, list):
        normalized_list = _normalize_image_list(images)
        return {"Default": normalized_list} if normalized_list else {}

    if not isinstance(images, dict):
        return {}

    normalized: dict[str, list[str]] = {}
    for color, image_list in images.items():
        color_key = str(color).strip()
        if not color_key:
            continue

        urls = _normalize_color_images(image_list)
        if urls:
            normalized[color_key] = urls

    return normalized


def calculate_total_stock(inventory: list | None) -> int:
    if not isinstance(inventory, list):
        return 0
    total = 0
    for item in inventory:
        if not isinstance(item, dict):
            continue
        try:
            total += int(item.get("stock", 0) or 0)
        except (TypeError, ValueError):
            continue
    return total


def _normalize_inventory_item(item: dict) -> dict:
    normalized_item = dict(item)
    try:
        normalized_item["stock"] = int(normalized_item.get("stock", 0) or 0)
    except (TypeError, ValueError):
        normalized_item["stock"] = 0

    for field in ("variantId", "color", "size"):
        if normalized_item.get(field) is not None:
            normalized_item[field] = str(normalized_item[field])
    return normalized_item


def _normalize_inventory(inventory: object) -> list[dict]:
    if not isinstance(inventory, list):
        return []
    return [
        _normalize_inventory_item(item)
        for item in inventory
        if isinstance(item, dict)
    ]


def serialize_product(product: dict) -> dict:
    product = dict(product)
    if "_id" in product:
        product["_id"] = str(product["_id"])

    normalized_inventory = _normalize_inventory(product.get("inventory", []))
    product["inventory"] = normalized_inventory
    total_stock = calculate_total_stock(normalized_inventory)
    product["totalStock"] = total_stock
    product["stock"] = total_stock
    images = normalize_product_images(product.get("images", {}))
    product["images"] = images
    for field in ("createdAt", "updatedAt"):
        value = product.get(field)
        if isinstance(value, datetime):
            pass
    return product
