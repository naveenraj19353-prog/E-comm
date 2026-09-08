from datetime import datetime


def sanitize_image_url(url: str | None) -> str:
    """Fix malformed Unsplash URLs (e.g. double https://images.unsplash.com/ prefix)."""
    value = (url or "").strip()
    if not value:
        return ""

    duplicate_prefix = "https://images.unsplash.com/https://"
    while value.startswith(duplicate_prefix):
        value = value[len("https://images.unsplash.com/") :]

    if value.count("?auto=format") > 1:
        first, remainder = value.split("?auto=format", 1)
        query, _extra = remainder.split("?auto=format", 1)
        value = f"{first}?auto=format{query}"

    return value


def normalize_product_images(images: dict | list | None) -> dict[str, list[str]]:
    if isinstance(images, list):
        normalized_list = [
            sanitize_image_url(item)
            for item in images
            if isinstance(item, str) and sanitize_image_url(item)
        ]
        if not normalized_list:
            return {}
        return {"Default": normalized_list}

    if not isinstance(images, dict):
        return {}

    normalized: dict[str, list[str]] = {}
    for color, image_list in images.items():
        color_key = str(color).strip()
        if not color_key:
            continue

        urls: list[str] = []
        if isinstance(image_list, str):
            cleaned = sanitize_image_url(image_list)
            if cleaned:
                urls.append(cleaned)
        elif isinstance(image_list, list):
            for item in image_list:
                if isinstance(item, str):
                    cleaned = sanitize_image_url(item)
                    if cleaned:
                        urls.append(cleaned)
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


def serialize_product(product: dict) -> dict:
    product = dict(product)
    if "_id" in product:
        product["_id"] = str(product["_id"])
    inventory = product.get("inventory", [])
    if not isinstance(inventory, list):
        inventory = []
    normalized_inventory = []
    for item in inventory:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        try:
            item["stock"] = int(item.get("stock", 0) or 0)
        except (TypeError, ValueError):
            item["stock"] = 0
        if item.get("variantId") is not None:
            item["variantId"] = str(item["variantId"])
        if item.get("color") is not None:
            item["color"] = str(item["color"])
        if item.get("size") is not None:
            item["size"] = str(item["size"])
        normalized_inventory.append(item)
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
