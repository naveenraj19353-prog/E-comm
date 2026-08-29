from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.database.mongo import products
from app.models.product import BulkImportProductItem


def _get_validators():
    from app.routes.product import (
        calculate_final_price,
        validate_color_images_against_inventory,
        validate_images,
        validate_inventory,
    )

    return (
        calculate_final_price,
        validate_inventory,
        validate_images,
        validate_color_images_against_inventory,
    )


def _find_existing_product(
    tenant_id: str,
    item: BulkImportProductItem,
) -> dict[str, Any] | None:
    if item.productId:
        if not ObjectId.is_valid(item.productId):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid productId '{item.productId}'.",
            )
        existing = products.find_one(
            {
                "_id": ObjectId(item.productId),
                "tenantId": tenant_id,
            }
        )
        if existing:
            return existing
        raise HTTPException(
            status_code=400,
            detail=(
                f"Product with productId '{item.productId}' "
                "was not found for this tenant."
            ),
        )

    return products.find_one(
        {
            "tenantId": tenant_id,
            "name": item.name.strip(),
            "categoryId": item.categoryId,
        }
    )


def _merge_images(
    existing: dict[str, list[str]] | None,
    incoming: dict[str, list[str]],
) -> dict[str, list[str]]:
    merged = dict(existing or {})
    for color, urls in incoming.items():
        if urls:
            merged[color] = urls
    return merged


def _merge_inventory(
    existing: list[dict[str, Any]] | None,
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not existing:
        return incoming

    merged = [dict(item) for item in existing]
    index_by_variant = {
        str(item.get("variantId", "")).strip().lower(): idx
        for idx, item in enumerate(merged)
    }
    index_by_combo = {
        (
            str(item.get("color", "")).strip().lower(),
            str(item.get("size", "")).strip().lower(),
        ): idx
        for idx, item in enumerate(merged)
    }

    for item in incoming:
        variant_key = str(item.get("variantId", "")).strip().lower()
        combo_key = (
            str(item.get("color", "")).strip().lower(),
            str(item.get("size", "")).strip().lower(),
        )
        if variant_key and variant_key in index_by_variant:
            merged[index_by_variant[variant_key]] = item
            continue
        if combo_key in index_by_combo:
            merged[index_by_combo[combo_key]] = item
            continue
        merged.append(item)

    return merged


def upsert_bulk_product(
    tenant_id: str,
    item: BulkImportProductItem,
) -> str:
    (
        calculate_final_price,
        validate_inventory,
        validate_images,
        validate_color_images_against_inventory,
    ) = _get_validators()

    inventory = [entry.model_dump() for entry in item.inventory]
    validate_inventory(inventory)
    for entry in inventory:
        entry["stock"] = int(entry.get("stock", 0))

    images = item.images or {}
    validate_images(images)
    if images:
        validate_color_images_against_inventory(inventory, images)

    final_price = calculate_final_price(item.price, item.discountPercentage)
    total_stock = sum(entry["stock"] for entry in inventory)
    now = datetime.now(timezone.utc)
    existing = _find_existing_product(tenant_id, item)

    if existing:
        merged_inventory = _merge_inventory(existing.get("inventory"), inventory) if inventory else existing.get("inventory", [])
        merged_images = _merge_images(existing.get("images"), images)
        if merged_images:
            validate_color_images_against_inventory(merged_inventory, merged_images)

        update_payload: dict[str, Any] = {
            "name": item.name.strip(),
            "description": item.description,
            "categoryId": item.categoryId,
            "categoryName": item.categoryName,
            "brand": item.brand,
            "price": item.price,
            "discountPercentage": item.discountPercentage,
            "finalPrice": final_price,
            "inventory": merged_inventory,
            "totalStock": sum(int(entry.get("stock", 0)) for entry in merged_inventory),
            "stock": sum(int(entry.get("stock", 0)) for entry in merged_inventory),
            "images": merged_images,
            "updatedAt": now,
        }
        if item.isActive is not None:
            update_payload["isActive"] = item.isActive

        products.update_one(
            {"_id": existing["_id"]},
            {"$set": update_payload},
        )
        return "updated"

    if inventory and images:
        validate_color_images_against_inventory(inventory, images)

    payload = {
        "tenantId": tenant_id,
        "name": item.name.strip(),
        "description": item.description,
        "categoryId": item.categoryId,
        "categoryName": item.categoryName,
        "brand": item.brand,
        "price": item.price,
        "discountPercentage": item.discountPercentage,
        "finalPrice": final_price,
        "inventory": inventory,
        "totalStock": total_stock,
        "stock": total_stock,
        "images": images,
        "isActive": item.isActive if item.isActive is not None else True,
        "createdAt": now,
        "updatedAt": now,
        "averageRating": 0,
        "reviewCount": 0,
    }
    products.insert_one(payload)
    return "created"
