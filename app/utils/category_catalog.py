"""Build storefront categories from live product catalog (same source as filters)."""

from __future__ import annotations

from app.database.mongo import categories, products


def get_catalog_categories(
    tenant_id: str,
    *,
    allow_inactive: bool = False,
    limit: int | None = None,
) -> list[dict]:
    """
    Return categories that currently have products for the tenant.

    Mirrors get_tenant_product_filters category facet so header/nav/home
    stay in sync when products are added, edited, or removed.
    Enriches with description/image from the categories collection when present.
    """
    match: dict = {
        "tenantId": tenant_id,
        "categoryId": {"$nin": [None, ""]},
    }
    if not allow_inactive:
        match["isActive"] = True

    pipeline: list[dict] = [
        {"$match": match},
        {
            "$group": {
                "_id": "$categoryId",
                "name": {"$first": "$categoryName"},
                "productCount": {"$sum": 1},
                "sampleImages": {"$first": "$images"},
            }
        },
        {"$sort": {"name": 1, "_id": 1}},
    ]
    if limit is not None and limit > 0:
        pipeline.append({"$limit": limit})

    try:
        rows = list(products.aggregate(pipeline))
    except Exception as error:
        print("ERROR building catalog categories:", repr(error))
        return []

    meta_by_id: dict[str, dict] = {}
    meta_by_name: dict[str, dict] = {}
    try:
        meta_query: dict = {"tenantId": tenant_id}
        if not allow_inactive:
            meta_query["isActive"] = True
        for doc in categories.find(meta_query):
            key = str(doc.get("_id") or "").strip()
            if key:
                meta_by_id[key] = doc
                meta_by_id[key.lower()] = doc
            name_key = str(doc.get("name") or "").strip().lower()
            if name_key and name_key not in meta_by_name:
                meta_by_name[name_key] = doc
    except Exception as error:
        print("ERROR loading category metadata:", repr(error))

    data: list[dict] = []
    for row in rows:
        category_id = str(row.get("_id") or "").strip()
        if not category_id:
            continue

        meta = (
            meta_by_id.get(category_id)
            or meta_by_id.get(category_id.lower())
            or meta_by_name.get(str(row.get("name") or "").strip().lower())
            or {}
        )

        name = str(
            row.get("name")
            or meta.get("name")
            or category_id
        ).strip() or category_id

        image = meta.get("image")
        if not image:
            image = _first_product_image(row.get("sampleImages"))

        data.append(
            {
                "_id": category_id,
                "categoryId": category_id,
                "tenantId": tenant_id,
                "name": name,
                "description": meta.get("description") or "",
                "image": image,
                "isActive": True,
                "productCount": int(row.get("productCount") or 0),
                "createdAt": meta.get("createdAt"),
                "updatedAt": meta.get("updatedAt"),
            }
        )

    return data


def _first_product_image(images) -> str | None:
    if isinstance(images, list):
        for item in images:
            if isinstance(item, str) and item.strip():
                return item.strip()
        return None
    if not isinstance(images, dict):
        return None
    for value in images.values():
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
    return None
