import logging
import json
import re
from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from pymongo import ReturnDocument
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.mongo import products, tenants
from app.models.product import (
    BulkImportRequest,
    CreateProduct,
    ProductSearchRequest,
    UpdateProduct,
    VariantStockRequest,
)
from app.routes.detail_messages import INVALID_PRODUCT_ID, PRODUCT_NOT_FOUND
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    get_optional_user,
    require_admin,
    require_customer,
    require_permission,
)
from app.services.cache import cached_storefront, invalidate_tenant
from app.services.low_stock import (
    LOW_STOCK_LIST_LIMIT,
    low_stock_items,
    low_stock_query,
    maybe_alert_low_stock,
    tenant_threshold,
)
from app.services.stock_movements import (
    ADJUSTMENT_REASONS,
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT,
    StockAdjustmentError,
    build_movement,
    inventory_changes,
    record_movements,
    serialize_movement,
    validate_adjustment,
    variant_stock,
)
from pydantic import BaseModel, Field as PydanticField
from app.services.store_permissions import user_has_permission
from app.services.s3_service import (
    collect_image_keys,
    delete_tenant_image_keys,
    validate_tenant_image_key,
)
from app.utils.product_serialize import (
    calculate_total_stock,
    serialize_product,
)
from app.services.product_duplicates import (
    duplicate_product_detail,
    find_duplicate_product,
)
from app.services.variant_sku import assign_variant_ids_for_inventory
from app.services.whatsapp_notification_service import (
    ProductShareError,
    share_product_with_customer,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/product",
    tags=["Product"],
)
MONGO_MATCH_STAGE = "$match"
MONGO_GROUP_STAGE = "$group"
MONGO_OPTIONS_OPERATOR = "$options"
MONGO_ELEM_MATCH_OPERATOR = "$elemMatch"
PRODUCT_SORT_FIELDS = {
    "createdAt": "createdAt",
    "price": "finalPrice",
    "rating": "averageRating",
    "discount": "discountPercentage",
    "name": "name",
}


def calculate_final_price(
    price: float,
    discount_percentage: float,
) -> float:
    return round(
        price - (
            price * discount_percentage / 100
        ),
        2,
    )
def _normalize_image_key(
    image_value: str,
    tenant_id: str,
    folder: str,
) -> str:
    """Accept a raw S3 key or a presigned/public URL that contains one."""
    from urllib.parse import unquote, urlparse

    cleaned = image_value.strip()
    try:
        return validate_tenant_image_key(
            cleaned,
            tenant_id,
            folder,
        )
    except ValueError:
        pass

    path = unquote(urlparse(cleaned).path or "").lstrip("/")
    try:
        return validate_tenant_image_key(
            path,
            tenant_id,
            folder,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail="Invalid image key.",
        ) from error


def validate_images(
    images: dict,
    tenant_id: str,
    folder: str = "products",
) -> dict:
    """
    Expected:
    {
        "Green": [
            "tenants/{tenantId}/products/uuid.jpg"
        ]
    }

    Also accepts temporary S3 URLs and rewrites them to keys.
    """
    if not isinstance(images, dict):
        raise HTTPException(
            status_code=400,
            detail="Images must be an object grouped by color.",
        )
    normalized: dict[str, list[str]] = {}
    for color, image_list in images.items():
        if not isinstance(color, str) or not color.strip():
            raise HTTPException(
                status_code=400,
                detail="Image color cannot be empty.",
            )
        if not isinstance(image_list, list):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Images for color '{color}' "
                    "must be an array."
                ),
            )
        cleaned_list: list[str] = []
        for image_value in image_list:
            if not isinstance(image_value, str):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Image key for color "
                        f"'{color}' must be a string."
                    ),
                )
            if not image_value.strip():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Image key for color "
                        f"'{color}' cannot be empty."
                    ),
                )
            cleaned_list.append(
                _normalize_image_key(
                    image_value,
                    tenant_id,
                    folder,
                )
            )
        normalized[color.strip()] = cleaned_list
    return normalized


def _inventory_item_values(item: dict) -> tuple[str, str, str]:
    if not isinstance(item, dict):
        raise HTTPException(
            status_code=400,
            detail="Invalid inventory item.",
        )

    variant_id = str(item.get("variantId", "")).strip()
    color = str(item.get("color", "")).strip()
    size = str(item.get("size", "")).strip()

    if not variant_id:
        raise HTTPException(
            status_code=400,
            detail="Variant ID cannot be empty.",
        )
    if not color:
        raise HTTPException(
            status_code=400,
            detail="Inventory color cannot be empty.",
        )
    if not size:
        raise HTTPException(
            status_code=400,
            detail="Inventory size cannot be empty.",
        )

    try:
        stock = int(item.get("stock", 0))
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid stock for variant '{variant_id}'. Stock must be a number.",
        ) from error
    if stock < 0:
        raise HTTPException(
            status_code=400,
            detail="Inventory stock cannot be negative.",
        )

    return variant_id, color, size


def _record_unique_inventory_variant(
    variant_id: str,
    color: str,
    size: str,
    variant_ids: set[str],
    combinations: set[tuple[str, str]],
) -> None:
    if variant_id in variant_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate variantId: {variant_id}",
        )

    combination = (color.lower(), size.lower())
    if combination in combinations:
        raise HTTPException(
            status_code=400,
            detail=(
                "Duplicate color/size combination: "
                f"{color} / {size}"
            ),
        )

    variant_ids.add(variant_id)
    combinations.add(combination)


def validate_inventory(inventory: list) -> None:
    if not isinstance(inventory, list):
        raise HTTPException(
            status_code=400,
            detail="Inventory must be an array.",
        )

    variant_ids: set[str] = set()
    combinations: set[tuple[str, str]] = set()
    for item in inventory:
        variant_id, color, size = _inventory_item_values(item)
        _record_unique_inventory_variant(
            variant_id,
            color,
            size,
            variant_ids,
            combinations,
        )


def _prepare_inventory_for_product_creation(
    tenant_id: str,
    product_data: dict,
    inventory: list,
) -> list:
    return assign_variant_ids_for_inventory(
        product_data,
        inventory,
    )


def _prepare_inventory_for_product_update(
    tenant_id: str,
    product_data: dict,
    inventory: list,
    existing_product: dict | None,
) -> list:
    # variantId only has to be unique within this product (validate_inventory
    # checks that); stock is always looked up by productId + variantId, and
    # different products may share a variantId such as "black-m".
    return assign_variant_ids_for_inventory(
        product_data,
        inventory,
        existing_inventory=(existing_product or {}).get("inventory") or [],
    )


def validate_color_images_against_inventory(
    inventory: list,
    images: dict,
):
    """
    Images can only contain colors that exist
    in inventory.
    """
    if not isinstance(images, dict):
        return
    inventory_colors = {
        str(item.get("color", "")).strip().lower()
        for item in inventory
        if isinstance(item, dict)
        and item.get("color")
    }
    image_colors = {
        str(color).strip().lower()
        for color in images.keys()
        if color
    }
    invalid_colors = (
        image_colors - inventory_colors
    )
    if invalid_colors:
        raise HTTPException(
            status_code=400,
            detail=(
                "Images contain colors that are not "
                "present in inventory: "
                f"{', '.join(sorted(invalid_colors))}"
            ),
        )


@router.post(
    "/create-product",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def create_product(
    product: CreateProduct,
    current_user: Annotated[dict, Depends(require_permission("products_update"))],
):
    tenant_id = admin_tenant_id(current_user, product.tenantId)
    category_id = product.categoryId.strip()
    existing = find_duplicate_product(
        tenant_id,
        name=product.name,
        category_id=category_id,
        category_name=product.categoryName,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=duplicate_product_detail(existing),
        )


    inventory = [
        item.model_dump()
        for item in product.inventory
    ]
    inventory = _prepare_inventory_for_product_creation(
        tenant_id,
        {
            "brand": product.brand,
            "categoryName": product.categoryName,
            "categoryId": product.categoryId,
        },
        inventory,
    )
    validate_inventory(
        inventory
    )

    for item in inventory:
        item["stock"] = int(
            item.get("stock", 0)
        )


    images = validate_images(
        product.images,
        tenant_id,
        "products",
    )
    validate_color_images_against_inventory(
        inventory,
        images,
    )


    final_price = calculate_final_price(
        product.price,
        product.discountPercentage,
    )


    total_stock = calculate_total_stock(
        inventory
    )


    now = datetime.now(
        timezone.utc
    )

    category_id = product.categoryId.strip()
    category_name = (
        (product.categoryName or "").strip()
        or category_id.replace("_", " ").replace("-", " ").title()
    )

    payload = {
        "tenantId": tenant_id,
        "name": product.name.strip(),
        "description": product.description,
        "categoryId": category_id,
        "categoryName": category_name,
        "brand": product.brand,
        "location": product.location,
        "foodType": product.foodType,
        "price": product.price,
        "discountPercentage": (
            product.discountPercentage
        ),
        "finalPrice": final_price,
        "inventory": inventory,
        "totalStock": total_stock,
        "stock": total_stock,
        "images": images,
        # A draft is saved but hidden from the storefront until published.
        "isActive": not bool(product.isDraft),
        "isDraft": bool(product.isDraft),
        "createdAt": now,
        "updatedAt": now,
        "averageRating": 0,
        "reviewCount": 0,
    }
    result = products.insert_one(
        payload
    )
    invalidate_tenant(tenant_id)
    return {
        "success": True,
        "productId": str(
            result.inserted_id
        ),
        "message": (
            "Product created successfully."
        ),
    }


@router.post(
    "/bulk-import",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def bulk_import_products(
    body: BulkImportRequest,
    current_user: Annotated[dict, Depends(require_permission("products_update"))],
):
    from app.services.bulk_product_import import upsert_bulk_product

    tenant_id = admin_tenant_id(current_user, body.tenantId)
    tenant = tenants.find_one(
        {"$or": [{"tenantId": tenant_id}, {"_id": tenant_id}]},
        {"businessType": 1},
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    business_type = str(tenant.get("businessType") or "retail").lower()
    created = 0
    updated = 0
    errors: list[dict] = []

    for index, item in enumerate(body.products):
        try:
            result = upsert_bulk_product(
                tenant_id,
                item,
                business_type,
            )
            if result == "created":
                created += 1
            else:
                updated += 1
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            errors.append(
                {
                    "index": index,
                    "name": item.name,
                    "detail": detail,
                }
            )
        except Exception as exc:
            errors.append(
                {
                    "index": index,
                    "name": item.name,
                    "detail": str(exc),
                }
            )

    invalidate_tenant(tenant_id)
    return {
        "success": len(errors) == 0,
        "created": created,
        "updated": updated,
        "failed": len(errors),
        "errors": errors,
    }


def _clean_filter_values(values) -> list[str]:
    unique = []
    seen = set()
    for value in values or []:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(text)
    unique.sort(key=str.lower)
    return unique


def _empty_product_filters() -> dict:
    return {
        "brand": [],
        "foodType": [],
        "color": [],
        "size": [],
        "category": [],
        "price": {
            "min": 0,
            "max": 0,
        },
    }


def get_tenant_product_filters(
    tenant_id: str,
    allow_inactive: bool = False,
) -> dict:
    """Filter facets for a tenant. The public variant (active products only)
    is cached per tenant; the admin variant with inactive products never is."""
    try:
        if allow_inactive:
            return _build_tenant_product_filters(tenant_id, True)
        return cached_storefront(
            tenant_id,
            "filters",
            (),
            lambda: _build_tenant_product_filters(tenant_id, False),
        )
    except Exception as error:
        # Not cached: the next request retries the aggregation.
        logger.exception("ERROR building product filters")
        return _empty_product_filters()


def _build_tenant_product_filters(
    tenant_id: str,
    allow_inactive: bool,
) -> dict:
    match = {"tenantId": tenant_id}
    if not allow_inactive:
        match["isActive"] = True
    empty = _empty_product_filters()
    result = list(
        products.aggregate(
            [
                {MONGO_MATCH_STAGE: match},
                {
                    "$facet": {
                        "price": [
                            {
                                MONGO_GROUP_STAGE: {
                                    "_id": None,
                                    "min": {"$min": "$finalPrice"},
                                    "max": {"$max": "$finalPrice"},
                                }
                            }
                        ],
                        "brands": [
                            {
                                MONGO_MATCH_STAGE: {
                                    "brand": {"$nin": [None, ""]},
                                }
                            },
                            {MONGO_GROUP_STAGE: {"_id": "$brand"}},
                            {"$sort": {"_id": 1}},
                        ],
                        "foodTypes": [
                            {
                                MONGO_MATCH_STAGE: {
                                    "foodType": {"$nin": [None, ""]},
                                }
                            },
                            {MONGO_GROUP_STAGE: {"_id": "$foodType"}},
                            {"$sort": {"_id": 1}},
                        ],
                        "categories": [
                            {
                                MONGO_MATCH_STAGE: {
                                    "categoryId": {"$nin": [None, ""]},
                                }
                            },
                            {
                                MONGO_GROUP_STAGE: {
                                    "_id": "$categoryId",
                                    "name": {
                                        "$first": "$categoryName"
                                    },
                                }
                            },
                            {"$sort": {"name": 1}},
                        ],
                        "variants": [
                            {
                                "$unwind": {
                                    "path": "$inventory",
                                    "preserveNullAndEmptyArrays": False,
                                }
                            },
                            {
                                MONGO_GROUP_STAGE: {
                                    "_id": None,
                                    "colors": {
                                        "$addToSet": "$inventory.color"
                                    },
                                    "sizes": {
                                        "$addToSet": "$inventory.size"
                                    },
                                }
                            },
                        ],
                    }
                },
            ]
        )
    )
    if not result:
        return empty
    facets = result[0]
    price_row = (facets.get("price") or [{}])[0]
    variant_row = (facets.get("variants") or [{}])[0]
    categories = []
    for item in facets.get("categories") or []:
        category_id = str(item.get("_id") or "").strip()
        if not category_id:
            continue
        categories.append(
            {
                "id": category_id,
                "name": str(item.get("name") or category_id).strip(),
            }
        )
    min_price = price_row.get("min")
    max_price = price_row.get("max")
    if min_price is None:
        min_price = 0
    if max_price is None:
        max_price = min_price
    return {
        "brand": _clean_filter_values(
            [item.get("_id") for item in facets.get("brands") or []]
        ),
        "foodType": _clean_filter_values(
            [item.get("_id") for item in facets.get("foodTypes") or []]
        ),
        "color": _clean_filter_values(variant_row.get("colors")),
        "size": _clean_filter_values(variant_row.get("sizes")),
        "category": categories,
        "price": {
            "min": round(float(min_price), 2),
            "max": round(max(float(max_price), float(min_price)), 2),
        },
    }


def _normalize_product_filter_values(
    values: list[str] | None,
) -> list[str]:
    normalized = []
    for value in values or []:
        if value is None:
            continue
        for part in str(value).strip().split(","):
            part = part.strip()
            if part:
                normalized.append(part)

    unique = []
    seen = set()
    for value in normalized:
        key = value.lower()
        if key not in seen:
            seen.add(key)
            unique.append(value)
    return unique


def _normalize_product_pagination(
    page: int,
    limit: int,
) -> tuple[int, int, int]:
    normalized_page = max(page, 1)
    normalized_limit = min(max(limit, 1), 100)
    skip = (normalized_page - 1) * normalized_limit
    return normalized_page, normalized_limit, skip


def _allow_inactive_products(
    include_inactive: bool,
    current_user: dict | None,
    tenant_id: str,
) -> bool:
    if not include_inactive or not current_user:
        return False
    if current_user.get("role") not in ("admin", "super_admin"):
        return False
    try:
        admin_tenant_id(current_user, tenant_id)
        return True
    except HTTPException:
        return False


def _case_insensitive_regex(value: str) -> dict:
    return {
        "$regex": f"^{re.escape(value)}$",
        MONGO_OPTIONS_OPERATOR: "i",
    }


def _multiple_regex_condition(
    field: str,
    values: list[str],
) -> dict | None:
    if not values:
        return None
    regexes = [_case_insensitive_regex(value) for value in values]
    if len(regexes) == 1:
        return {field: regexes[0]}
    return {
        "$or": [
            {field: regex}
            for regex in regexes
        ]
    }


def _add_price_filter(
    query: dict,
    min_price: float | None,
    max_price: float | None,
) -> None:
    if min_price is None and max_price is None:
        return
    query["finalPrice"] = {}
    if min_price is not None:
        query["finalPrice"]["$gte"] = min_price
    if max_price is not None:
        query["finalPrice"]["$lte"] = max_price


def _add_inventory_filter(
    query: dict,
    sizes: list[str],
    colors: list[str],
) -> None:
    conditions = []
    size_condition = _multiple_regex_condition("size", sizes)
    color_condition = _multiple_regex_condition("color", colors)
    if size_condition:
        conditions.append(size_condition)
    if color_condition:
        conditions.append(color_condition)
    if not conditions:
        return
    query["inventory"] = {
        MONGO_ELEM_MATCH_OPERATOR: {
            "$and": conditions,
        }
    }


def _add_search_filter(
    query: dict,
    search: str | None,
) -> None:
    if not search:
        return
    search_regex = re.escape(search)
    search_conditions = [
        {
            field: {
                "$regex": search_regex,
                MONGO_OPTIONS_OPERATOR: "i",
            }
        }
        for field in ("name", "description", "brand")
    ]
    if "$or" in query:
        query["$and"] = [
            {"$or": query.pop("$or")},
            {"$or": search_conditions},
        ]
        return
    query["$or"] = search_conditions


def _build_all_products_query(
    tenant_id: str,
    allow_inactive: bool,
    category_ids: list[str],
    brands: list[str],
    food_types: list[str],
    min_price: float | None,
    max_price: float | None,
    sizes: list[str],
    colors: list[str],
    rating: float | None,
    search: str | None,
) -> dict:
    query = {"tenantId": tenant_id}
    if not allow_inactive:
        query["isActive"] = True
    if category_ids:
        query["categoryId"] = {"$in": category_ids}

    brand_condition = _multiple_regex_condition("brand", brands)
    if brand_condition:
        query.update(brand_condition)
    food_type_condition = _multiple_regex_condition("foodType", food_types)
    if food_type_condition:
        query.update(food_type_condition)
    _add_price_filter(query, min_price, max_price)
    _add_inventory_filter(query, sizes, colors)
    if rating is not None:
        query["averageRating"] = {"$gte": rating}
    _add_search_filter(query, search)
    return query


def _resolve_product_sort(
    sort_by: str,
    sort_order: str,
) -> tuple[str, int]:
    sort_field = PRODUCT_SORT_FIELDS.get(sort_by, "createdAt")
    direction = -1 if sort_order.lower() == "desc" else 1
    return sort_field, direction


def _count_all_products(query: dict) -> int:
    try:
        return products.count_documents(query)
    except Exception as error:
        logger.exception("ERROR counting products")
        raise HTTPException(
            status_code=500,
            detail="Failed to count products.",
        ) from error


def _fetch_all_products(
    query: dict,
    sort_field: str,
    sort_order: int,
    skip: int,
    limit: int,
) -> list[dict]:
    try:
        cursor = (
            products.find(query)
            .sort(sort_field, sort_order)
            .skip(skip)
            .limit(limit)
        )
        return [
            serialize_product(product)
            for product in cursor
        ]
    except Exception as error:
        logger.exception("ERROR fetching products")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch products.",
        ) from error


def _assemble_all_products_response(
    data: list[dict],
    total_count: int,
    page: int,
    limit: int,
    filter_data: dict,
) -> dict:
    total_pages = (
        (total_count + limit - 1) // limit
        if total_count > 0
        else 0
    )
    return {
        "success": True,
        "count": len(data),
        "totalCount": total_count,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
        "hasNextPage": page < total_pages,
        "hasPreviousPage": page > 1,
        "filter": filter_data,
        "data": data,
    }


def _product_filter_parameters(
    category_ids: Annotated[
        list[str] | None, Query(alias="categoryIds")
    ] = None,
    min_price: Annotated[float | None, Query(alias="minPrice")] = None,
    max_price: Annotated[float | None, Query(alias="maxPrice")] = None,
    sizes: Annotated[list[str] | None, Query()] = None,
    colors: Annotated[list[str] | None, Query()] = None,
    brands: Annotated[list[str] | None, Query()] = None,
    food_types: Annotated[
        list[str] | None, Query(alias="foodTypes")
    ] = None,
    rating: float | None = None,
    search: str | None = None,
) -> dict:
    return {
        "categoryIds": category_ids,
        "minPrice": min_price,
        "maxPrice": max_price,
        "sizes": sizes,
        "colors": colors,
        "brands": brands,
        "foodTypes": food_types,
        "rating": rating,
        "search": search,
    }


def _product_listing_parameters(
    current_user: Annotated[dict | None, Depends(get_optional_user)],
    page: int = 1,
    limit: int = 12,
    sort_by: Annotated[str, Query(alias="sortBy")] = "createdAt",
    sort_order: Annotated[str, Query(alias="sortOrder")] = "desc",
    include_inactive: Annotated[bool, Query(alias="includeInactive")] = False,
) -> dict:
    return {
        "page": page,
        "limit": limit,
        "sortBy": sort_by,
        "sortOrder": sort_order,
        "includeInactive": include_inactive,
        "current_user": current_user,
    }


@router.get(
    "/get-all-products",
    responses={500: INTERNAL_SERVER_ERROR_RESPONSE[500]},
)
def get_all_products(
    tenant_id: Annotated[str, Query(alias="tenantId")],
    filters: Annotated[dict, Depends(_product_filter_parameters)],
    listing: Annotated[dict, Depends(_product_listing_parameters)],
):
    page, limit, skip = _normalize_product_pagination(
        listing["page"],
        listing["limit"],
    )
    category_ids = _normalize_product_filter_values(filters["categoryIds"])
    sizes = _normalize_product_filter_values(filters["sizes"])
    colors = _normalize_product_filter_values(filters["colors"])
    brands = _normalize_product_filter_values(filters["brands"])
    food_types = _normalize_product_filter_values(filters["foodTypes"])
    search_value = filters["search"]
    search = search_value.strip() if search_value else None
    allow_inactive = _allow_inactive_products(
        listing["includeInactive"],
        listing["current_user"],
        tenant_id,
    )
    query = _build_all_products_query(
        tenant_id,
        allow_inactive,
        category_ids,
        brands,
        food_types,
        filters["minPrice"],
        filters["maxPrice"],
        sizes,
        colors,
        filters["rating"],
        search,
    )
    sort_field, sort_order = _resolve_product_sort(
        listing["sortBy"],
        listing["sortOrder"],
    )

    def build() -> dict:
        total_count = _count_all_products(query)
        data = _fetch_all_products(
            query,
            sort_field,
            sort_order,
            skip,
            limit,
        )
        filter_data = get_tenant_product_filters(
            tenant_id,
            allow_inactive,
        )
        return _assemble_all_products_response(
            data,
            total_count,
            page,
            limit,
            filter_data,
        )

    if allow_inactive:
        # Admin view including inactive products: never cached, so it can
        # never be served to a shopper.
        return build()
    cache_parts = (
        page,
        limit,
        sort_field,
        sort_order,
        tuple(category_ids),
        tuple(brands),
        tuple(food_types),
        filters["minPrice"],
        filters["maxPrice"],
        tuple(sizes),
        tuple(colors),
        filters["rating"],
        search,
    )
    return cached_storefront(tenant_id, "products", cache_parts, build)


def _add_search_inventory_filter(
    query: dict,
    sizes: list[str],
    colors: list[str],
) -> None:
    conditions = []
    if sizes:
        conditions.append({"size": {"$in": sizes}})
    if colors:
        conditions.append({"color": {"$in": colors}})
    if not conditions:
        return
    query["inventory"] = {
        MONGO_ELEM_MATCH_OPERATOR: {
            "$and": conditions,
        }
    }


def _build_search_product_query(request: ProductSearchRequest) -> dict:
    query = {
        "tenantId": request.tenantId,
        "isActive": True,
    }
    search = request.search.strip() if request.search else None
    _add_search_filter(query, search)
    if request.categoryIds:
        query["categoryId"] = {"$in": request.categoryIds}
    _add_price_filter(query, request.minPrice, request.maxPrice)
    _add_search_inventory_filter(query, request.sizes, request.colors)
    if request.rating is not None:
        query["averageRating"] = {"$gte": request.rating}
    return query


def _resolve_search_product_sort(
    sort_by: str,
    sort_order: str,
) -> tuple[str, int]:
    sort_field = PRODUCT_SORT_FIELDS.get(sort_by, "createdAt")
    direction = 1 if sort_order.lower() == "asc" else -1
    return sort_field, direction


def _fetch_search_products(
    query: dict,
    sort_field: str,
    sort_direction: int,
    skip: int,
    limit: int,
) -> list[dict]:
    try:
        cursor = (
            products.find(query)
            .sort(sort_field, sort_direction)
            .skip(skip)
            .limit(limit)
        )
        return [
            serialize_product(product)
            for product in cursor
        ]
    except Exception as error:
        logger.exception("ERROR searching products")
        raise HTTPException(
            status_code=500,
            detail="Failed to search products.",
        ) from error


@router.post("/search", responses={500: INTERNAL_SERVER_ERROR_RESPONSE[500]})
def search_product(
    request: ProductSearchRequest,
):
    query = _build_search_product_query(request)
    sort_field, sort_direction = _resolve_search_product_sort(
        request.sortBy,
        request.sortOrder,
    )
    page, limit, skip = _normalize_product_pagination(
        request.page,
        request.limit,
    )

    def build() -> dict:
        total_count = _count_all_products(query)
        data = _fetch_search_products(
            query,
            sort_field,
            sort_direction,
            skip,
            limit,
        )
        filter_data = get_tenant_product_filters(request.tenantId, False)
        return _assemble_all_products_response(
            data,
            total_count,
            page,
            limit,
            filter_data,
        )

    # Public (active products only, no auth): cached per tenant and request.
    request_key = json.dumps(
        request.model_dump(mode="json"),
        sort_keys=True,
        default=str,
    )
    return cached_storefront(request.tenantId, "search", (request_key,), build)
def get_new_arrivals(
    tenant_id: Annotated[str, Query(alias="tenantId")],
    limit: int = 10,
):
    normalized_limit = min(
        max(limit, 1),
        100,
    )
    query = {
        "tenantId": tenant_id,
        "isActive": True,
        "inventory": {
            MONGO_ELEM_MATCH_OPERATOR: {
                "stock": {
                    "$gt": 0
                }
            }
        },
    }
    try:
        cursor = (
            products.find(query)
            .sort(
                "createdAt",
                -1,
            )
            .limit(normalized_limit)
        )
        data = []
        for product in cursor:
            data.append(
                serialize_product(product)
            )
    except Exception as e:
        logger.exception("ERROR fetching new arrivals")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch new arrivals.",
        )
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.post(
    "/{id}/share-whatsapp",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def share_product_on_whatsapp(
    id: str,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_PRODUCT_ID)
    product = products.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
    try:
        return share_product_with_customer(
            tenant_id=tenant_id,
            user_id=user_id,
            product=product,
        )
    except ProductShareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get(
    "/low-stock",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def list_low_stock_products(
    current_user: Annotated[dict, Depends(require_permission("read"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    """Variants at or below the store's low-stock alert level (REQ-035).

    Declared before GET /{id} so "low-stock" is not read as a product id.
    """
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    tenant = tenants.find_one({"tenantId": scoped_tenant_id}, {"lowStockThreshold": 1}) or {}
    threshold = tenant_threshold(tenant)
    docs = products.find(
        low_stock_query(scoped_tenant_id, threshold),
        {"name": 1, "inventory": 1},
    ).limit(LOW_STOCK_LIST_LIMIT)
    items = low_stock_items(docs, threshold)
    return {
        "success": True,
        "threshold": threshold,
        "count": len(items),
        "outOfStock": sum(1 for item in items if item["lowestStock"] <= 0),
        "data": items,
    }


@router.get(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def get_product(
    id: str,
    tenant_id: Annotated[str, Query(alias="tenantId")],
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_PRODUCT_ID,
        )
    query = {
        "_id": ObjectId(id),
        "tenantId": tenant_id,
        "isActive": True,
    }
    try:
        product = products.find_one(
            query
        )
    except Exception as e:
        logger.exception("ERROR fetching product")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch product.",
        )
    if not product:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )
    product = serialize_product(
        product
    )
    return {
        "success": True,
        "data": product,
    }


def _validate_product_update_values(update_data: dict) -> None:
    if "name" in update_data:
        name = str(update_data["name"]).strip()
        if not name:
            raise HTTPException(
                status_code=400,
                detail="Product name cannot be empty.",
            )
        update_data["name"] = name

    if "price" in update_data and update_data["price"] < 0:
        raise HTTPException(
            status_code=400,
            detail="Price cannot be negative.",
        )

    discount = update_data.get("discountPercentage")
    if discount is not None and (discount < 0 or discount > 100):
        raise HTTPException(
            status_code=400,
            detail="Discount must be between 0 and 100.",
        )

def _prepare_updated_inventory(update_data: dict, existing_product: dict | None = None, tenant_id: str | None = None) -> list | None:
    inventory = None
    if "inventory" in update_data:
        inventory = update_data["inventory"]
        if existing_product is not None and tenant_id:
            inventory = _prepare_inventory_for_product_update(
                tenant_id,
                {
                    "brand": existing_product.get("brand"),
                    "categoryName": existing_product.get("categoryName"),
                    "categoryId": existing_product.get("categoryId"),
                },
                inventory,
                existing_product,
            )
        validate_inventory(inventory)
        for item in inventory:
            item["stock"] = int(item.get("stock", 0))
        update_data["totalStock"] = calculate_total_stock(inventory)
    return inventory


def _validate_updated_images(
    update_data: dict,
    inventory: list | None,
    db_product: dict,
    tenant_id: str,
) -> None:
    if "images" in update_data:
        images = validate_images(
            update_data["images"],
            tenant_id,
            "products",
        )
        update_data["images"] = images
        inventory_for_validation = (
            inventory
            if inventory is not None
            else db_product.get("inventory", [])
        )
        validate_color_images_against_inventory(
            inventory_for_validation,
            images,
        )


def _update_final_price(update_data: dict, db_product: dict) -> None:
    if "price" in update_data or "discountPercentage" in update_data:
        price = update_data.get(
            "price",
            db_product.get("price", 0),
        )
        discount = update_data.get(
            "discountPercentage",
            db_product.get("discountPercentage", 0),
        )
        update_data["finalPrice"] = calculate_final_price(
            price,
            discount,
        )


def _prepare_product_update(
    product: UpdateProduct,
    db_product: dict,
    tenant_id: str,
) -> dict:
    update_data = product.model_dump(
        exclude_unset=True,
        exclude_none=True,
    )
    update_data.pop("tenantId", None)
    # Publishing (isActive=True) ends draft; marking draft hides it.
    if update_data.get("isDraft") is True:
        update_data["isActive"] = False
    elif update_data.get("isActive") is True:
        update_data["isDraft"] = False
    _validate_product_update_values(update_data)
    inventory = _prepare_updated_inventory(
        update_data,
        existing_product=db_product,
        tenant_id=tenant_id,
    )
    _validate_updated_images(update_data, inventory, db_product, tenant_id)
    _update_final_price(update_data, db_product)
    update_data["updatedAt"] = datetime.now(timezone.utc)
    return update_data


def _persist_product_update(
    object_id: ObjectId,
    tenant_id: str,
    update_data: dict,
) -> None:
    try:
        result = products.update_one(
            {
                "_id": object_id,
                "tenantId": tenant_id,
            },
            {"$set": update_data},
        )
    except Exception as error:
        logger.exception("ERROR updating product")
        raise HTTPException(
            status_code=500,
            detail="Failed to update product.",
        ) from error
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )


def _cleanup_removed_product_images(
    tenant_id: str,
    old_images,
    new_images,
) -> None:
    removed_keys = collect_image_keys(old_images) - collect_image_keys(new_images)
    if removed_keys:
        delete_tenant_image_keys(removed_keys, tenant_id, "products")


@router.put(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def update_product(
    id: str,
    product: UpdateProduct,
    current_user: Annotated[dict, Depends(require_admin)],
):
    can_update = user_has_permission(current_user, "products_update")
    can_inventory = user_has_permission(current_user, "inventory")
    if not can_update and not can_inventory:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission for this action.",
        )
    if not can_update or not can_inventory:
        payload = product.model_dump(exclude_unset=True)
        if can_update:
            payload.pop("inventory", None)
        else:
            payload = {
                key: payload[key]
                for key in ("tenantId", "inventory")
                if key in payload
            }
        product = UpdateProduct(**payload)
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_PRODUCT_ID,
        )
    object_id = ObjectId(id)
    tenant_id = admin_tenant_id(current_user, product.tenantId)
    db_product = products.find_one(
        {
            "_id": object_id,
            "tenantId": tenant_id,
        }
    )
    if not db_product:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )

    update_data = _prepare_product_update(product, db_product, tenant_id)
    _persist_product_update(object_id, tenant_id, update_data)
    invalidate_tenant(tenant_id)
    if "inventory" in update_data:
        _log_product_edit_stock(db_product, update_data, tenant_id, current_user)

    # Mongo write succeeds first; then remove unused S3 objects.
    if "images" in update_data:
        _cleanup_removed_product_images(
            tenant_id,
            db_product.get("images"),
            update_data.get("images"),
        )

    return {
        "success": True,
        "message": "Product updated successfully.",
    }


def _log_product_edit_stock(
    db_product: dict,
    update_data: dict,
    tenant_id: str,
    current_user: dict,
) -> None:
    """Stock history rows for stock typed into the product edit form."""
    try:
        changes = inventory_changes(db_product.get("inventory"), update_data.get("inventory"))
        if not changes:
            return
        updated_product = {**db_product, "inventory": update_data.get("inventory") or []}
        now = update_data.get("updatedAt") or datetime.now(timezone.utc)
        docs = [
            build_movement(
                tenant_id=tenant_id,
                product=updated_product,
                variant_id=change["variantId"],
                change=change["change"],
                source="product_edit",
                stock_after=change["stockAfter"],
                user=current_user,
                now=now,
            )
            for change in changes
        ]
        record_movements(products.database["stock_movements"], docs)
    except Exception:
        logger.exception("Could not log product edit stock changes")


class StockAdjustmentRequest(BaseModel):
    tenantId: str | None = None
    variantId: str = PydanticField(min_length=1, max_length=120)
    change: int
    reason: str = PydanticField(min_length=1, max_length=40)
    note: str | None = PydanticField(default=None, max_length=200)


@router.post(
    "/{id}/stock-adjustments",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def adjust_product_stock(
    id: str,
    payload: StockAdjustmentRequest,
    current_user: Annotated[dict, Depends(require_permission("inventory"))],
):
    """Add or remove stock for one variant with a reason (REQ-034).

    The change is applied atomically and never takes stock below 0.
    """
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_PRODUCT_ID)
    tenant_id = admin_tenant_id(current_user, payload.tenantId)
    try:
        change, reason, note = validate_adjustment(payload.change, payload.reason, payload.note)
    except StockAdjustmentError as error:
        raise HTTPException(status_code=400, detail=str(error))

    object_id = ObjectId(id)
    variant_match: dict = {"variantId": payload.variantId}
    if change < 0:
        variant_match["stock"] = {"$gte": -change}
    now = datetime.now(timezone.utc)
    updated = products.find_one_and_update(
        {"_id": object_id, "tenantId": tenant_id, "inventory": {"$elemMatch": variant_match}},
        {"$inc": {"inventory.$.stock": change}, "$set": {"updatedAt": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        product = products.find_one({"_id": object_id, "tenantId": tenant_id}, {"inventory": 1})
        if not product:
            raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
        current = variant_stock(product, payload.variantId)
        if current is None:
            raise HTTPException(status_code=404, detail="Variant not found on this product.")
        raise HTTPException(
            status_code=400,
            detail=f"Only {current} in stock; you can remove at most {current}.",
        )

    total = sum(int(item.get("stock", 0) or 0) for item in updated.get("inventory") or [])
    maybe_alert_low_stock(
        tenant_id,
        updated,
        payload.variantId,
        variant_stock(updated, payload.variantId),
        change,
        tenants.find_one({"tenantId": tenant_id}, {"lowStockThreshold": 1}) or {},
    )
    products.update_one({"_id": object_id}, {"$set": {"totalStock": total}})
    invalidate_tenant(tenant_id)
    stock_after = variant_stock(updated, payload.variantId)
    record_movements(
        products.database["stock_movements"],
        [
            build_movement(
                tenant_id=tenant_id,
                product=updated,
                variant_id=payload.variantId,
                change=change,
                source="manual_adjustment",
                stock_after=stock_after,
                reason=reason,
                note=note,
                user=current_user,
                now=now,
            )
        ],
    )
    return {
        "success": True,
        "message": "Stock updated.",
        "variantId": payload.variantId,
        "stock": stock_after,
        "totalStock": total,
    }


@router.get(
    "/{id}/stock-movements",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def list_product_stock_movements(
    id: str,
    current_user: Annotated[dict, Depends(require_permission("inventory"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_HISTORY_LIMIT)] = DEFAULT_HISTORY_LIMIT,
):
    """Stock history for one product, newest first (REQ-036)."""
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_PRODUCT_ID)
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    rows = (
        products.database["stock_movements"]
        .find({"tenantId": scoped_tenant_id, "productId": ObjectId(id)})
        .sort("createdAt", -1)
        .limit(limit)
    )
    return {
        "success": True,
        "reasons": ADJUSTMENT_REASONS,
        "data": [serialize_movement(row) for row in rows],
    }


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def delete_product(
    id: str,
    tenant_id: Annotated[str, Query(alias="tenantId")],
    current_user: Annotated[dict, Depends(require_permission("products_update"))],
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_PRODUCT_ID,
        )
    try:
        scoped_tenant = admin_tenant_id(current_user, tenant_id)
        db_product = products.find_one(
            {
                "_id": ObjectId(id),
                "tenantId": scoped_tenant,
            }
        )
        if not db_product:
            raise HTTPException(
                status_code=404,
                detail=PRODUCT_NOT_FOUND,
            )

        result = products.delete_one(
            {
                "_id": ObjectId(id),
                "tenantId": scoped_tenant,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR deleting product")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete product.",
        ) from e
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )
    invalidate_tenant(scoped_tenant)

    delete_tenant_image_keys(
        collect_image_keys(db_product.get("images")),
        scoped_tenant,
        "products",
    )
    return {
        "success": True,
        "message": (
            "Product deleted successfully."
        ),
    }


@router.get(
    "/{id}/inventory",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def get_product_inventory(
    id: str,
    tenant_id: Annotated[str, Query(alias="tenantId")],
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_PRODUCT_ID,
        )
    try:
        product = products.find_one(
            {
                "_id": ObjectId(id),
                "tenantId": tenant_id,
                "isActive": True,
            },
            {
                "inventory": 1,
            },
        )
    except Exception as e:
        logger.exception("ERROR fetching inventory")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch inventory.",
        )
    if not product:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )
    inventory = product.get(
        "inventory",
        [],
    )
    if not isinstance(inventory, list):
        inventory = []
    available_inventory = []
    for item in inventory:
        if not isinstance(item, dict):
            continue
        try:
            stock = int(
                item.get("stock", 0) or 0
            )
        except (TypeError, ValueError):
            stock = 0
        if stock > 0:
            item = dict(item)
            item["stock"] = stock
            available_inventory.append(
                item
            )
    return {
        "success": True,
        "data": available_inventory,
    }


@router.post(
    "/{id}/check-stock",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def check_variant_stock(
    id: str,
    request: VariantStockRequest,
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_PRODUCT_ID,
        )
    try:
        product = products.find_one(
            {
                "_id": ObjectId(id),
                "tenantId": request.tenantId,
                "isActive": True,
            },
            {
                "inventory": 1,
            },
        )
    except Exception as e:
        logger.exception("ERROR checking variant stock")
        raise HTTPException(
            status_code=500,
            detail="Failed to check variant stock.",
        )
    if not product:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )
    inventory = product.get(
        "inventory",
        [],
    )
    if not isinstance(inventory, list):
        inventory = []
    variant = next(
        (
            item
            for item in inventory
            if isinstance(item, dict)
            and str(item.get("variantId", ""))
            == str(request.variantId)
        ),
        None,
    )
    if not variant:
        raise HTTPException(
            status_code=404,
            detail="Variant not found.",
        )
    try:
        stock = int(
            variant.get("stock", 0) or 0
        )
    except (TypeError, ValueError):
        stock = 0
    variant = dict(variant)
    variant["stock"] = stock
    return {
        "success": True,
        "available": stock > 0,
        "stock": stock,
        "variant": variant,
    }
