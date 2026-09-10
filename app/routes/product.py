import re
from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.mongo import products
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
    get_optional_user,
    require_admin,
)
from app.services.s3_service import (
    collect_image_keys,
    delete_tenant_image_keys,
    validate_tenant_image_key,
)
from app.utils.product_serialize import (
    calculate_total_stock,
    serialize_product,
)

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
    current_user: Annotated[dict, Depends(require_admin)],
):
    tenant_id = admin_tenant_id(current_user, product.tenantId)


    existing = products.find_one(
        {
            "tenantId": tenant_id,
            "name": product.name.strip(),
            "categoryId": product.categoryId,
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Product already exists.",
        )


    inventory = [
        item.model_dump()
        for item in product.inventory
    ]
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
        "price": product.price,
        "discountPercentage": (
            product.discountPercentage
        ),
        "finalPrice": final_price,
        "inventory": inventory,
        "totalStock": total_stock,
        "stock": total_stock,
        "images": images,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
        "averageRating": 0,
        "reviewCount": 0,
    }
    result = products.insert_one(
        payload
    )
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
    current_user: Annotated[dict, Depends(require_admin)],
):
    from app.services.bulk_product_import import upsert_bulk_product

    tenant_id = admin_tenant_id(current_user, body.tenantId)
    created = 0
    updated = 0
    errors: list[dict] = []

    for index, item in enumerate(body.products):
        try:
            result = upsert_bulk_product(tenant_id, item)
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


def get_tenant_product_filters(
    tenant_id: str,
    allow_inactive: bool = False,
) -> dict:
    match = {"tenantId": tenant_id}
    if not allow_inactive:
        match["isActive"] = True
    empty = {
        "brand": [],
        "color": [],
        "size": [],
        "category": [],
        "price": {
            "min": 0,
            "max": 0,
        },
    }
    try:
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
    except Exception as error:
        print("ERROR building product filters:", repr(error))
        return empty
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
        "$regex": re.escape(value),
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
    conditions.append({"stock": {"$gt": 0}})
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
        print("ERROR counting products:", repr(error))
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
        print("ERROR fetching products:", repr(error))
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
        "rating": rating,
        "search": search,
    }


def _product_listing_parameters(
    current_user: Annotated[dict | None, Depends(get_optional_user)],
    page: int = 1,
    limit: int = 20,
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
    conditions.append({"stock": {"$gt": 0}})
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
        print("ERROR searching products:", repr(error))
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
        print(
            "ERROR fetching new arrivals:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch new arrivals.",
        )
    return {
        "success": True,
        "count": len(data),
        "data": data,
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
        print(
            "ERROR fetching product:",
            repr(e),
        )
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

def _prepare_updated_inventory(update_data: dict) -> list | None:
    inventory = None
    if "inventory" in update_data:
        inventory = update_data["inventory"]
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
    _validate_product_update_values(update_data)
    inventory = _prepare_updated_inventory(update_data)
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
        print("ERROR updating product:", repr(error))
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
    current_user: Annotated[dict, Depends(require_admin)],
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
        print(
            "ERROR deleting product:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to delete product.",
        ) from e
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=PRODUCT_NOT_FOUND,
        )

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
        print(
            "ERROR fetching inventory:",
            repr(e),
        )
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
        print(
            "ERROR checking variant stock:",
            repr(e),
        )
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
