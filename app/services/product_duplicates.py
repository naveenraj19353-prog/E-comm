from __future__ import annotations

import re
from typing import Any

from app.database.mongo import products

PRODUCT_ALREADY_EXISTS = "PRODUCT_ALREADY_EXISTS"
PRODUCT_ALREADY_EXISTS_MESSAGE = (
    "This product name is already in this category. "
    "Edit or update the existing product instead of creating it again."
)


def normalize_product_label(value: object) -> str:
    return " ".join(str(value or "").strip().split()).casefold()


def categories_match(
    product: dict[str, Any],
    category_id: str,
    category_name: str | None = None,
) -> bool:
    wanted = {normalize_product_label(category_id)}
    if category_name:
        wanted.add(normalize_product_label(category_name))
    wanted.discard("")
    have = {
        normalize_product_label(product.get("categoryId")),
        normalize_product_label(product.get("categoryName")),
    }
    have.discard("")
    return bool(wanted & have)


def find_duplicate_product(
    tenant_id: str,
    *,
    name: str,
    category_id: str,
    category_name: str | None = None,
) -> dict[str, Any] | None:
    name_norm = normalize_product_label(name)
    category_norm = normalize_product_label(category_id)
    if not tenant_id or not name_norm or not category_norm:
        return None
    escaped = re.escape(name.strip())
    candidates = products.find(
        {
            "tenantId": tenant_id,
            "name": {"$regex": f"^{escaped}$", "$options": "i"},
        }
    )
    for product in candidates:
        if normalize_product_label(product.get("name")) != name_norm:
            continue
        if categories_match(product, category_id, category_name):
            return product
    return None


def duplicate_product_detail(product: dict[str, Any]) -> dict[str, str]:
    return {
        "code": PRODUCT_ALREADY_EXISTS,
        "message": PRODUCT_ALREADY_EXISTS_MESSAGE,
        "productId": str(product.get("_id") or ""),
        "name": str(product.get("name") or "").strip(),
        "categoryId": str(product.get("categoryId") or "").strip(),
        "categoryName": str(product.get("categoryName") or "").strip(),
    }
