from datetime import datetime


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
    images = product.get("images", {})
    if not isinstance(images, dict):
        product["images"] = {}
    for field in ("createdAt", "updatedAt"):
        value = product.get(field)
        if isinstance(value, datetime):
            pass
    return product
