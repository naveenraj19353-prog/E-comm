from datetime import datetime, timezone
import re
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database.mongo import products
from app.models.product import (
    CreateProduct,
    UpdateProduct,
    ProductSearchRequest,
    VariantStockRequest,
)
from app.utils.product_serialize import (
    calculate_total_stock,
    serialize_product,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    get_optional_user,
    require_admin,
)
router = APIRouter(
    prefix="/product",
    tags=["Product"],
)
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
def validate_images(
    images: dict,
):
    """
    Expected:
    {
        "Green": [
            "https://...",
            "https://..."
        ],
        "Red": [
            "https://...",
            "https://..."
        ]
    }
    """
    if not isinstance(images, dict):
        raise HTTPException(
            status_code=400,
            detail="Images must be an object grouped by color.",
        )
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
        for image_url in image_list:
            if not isinstance(image_url, str):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Image URL for color "
                        f"'{color}' must be a string."
                    ),
                )
            if not image_url.strip():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Image URL for color "
                        f"'{color}' cannot be empty."
                    ),
                )


def validate_inventory(
    inventory: list,
):
    if not isinstance(inventory, list):
        raise HTTPException(
            status_code=400,
            detail="Inventory must be an array.",
        )
    variant_ids = set()
    combinations = set()
    for item in inventory:
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail="Invalid inventory item.",
            )
        variant_id = str(
            item.get("variantId", "")
        ).strip()
        color = str(
            item.get("color", "")
        ).strip()
        size = str(
            item.get("size", "")
        ).strip()
        stock = item.get("stock", 0)


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
            stock = int(stock)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid stock for variant "
                    f"'{variant_id}'. Stock must be a number."
                ),
            )
        if stock < 0:
            raise HTTPException(
                status_code=400,
                detail="Inventory stock cannot be negative.",
            )


        if variant_id in variant_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate variantId: {variant_id}",
            )


        combination = (
            color.lower(),
            size.lower(),
        )
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


@router.post("/create-product")
def create_product(
    product: CreateProduct,
    current_user: dict = Depends(require_admin),
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


    images = product.images
    validate_images(
        images
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


    payload = {
        "tenantId": tenant_id,
        "name": product.name.strip(),
        "description": product.description,
        "categoryId": product.categoryId,
        "categoryName": product.categoryName,
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


@router.get("/get-all-products")
def get_all_products(
    tenantId: str,
    page: int = 1,
    limit: int = 20,
    categoryIds: list[str] | None = Query(
        default=None
    ),
    minPrice: float | None = None,
    maxPrice: float | None = None,
    sizes: list[str] | None = Query(
        default=None
    ),
    colors: list[str] | None = Query(
        default=None
    ),
    rating: float | None = None,
    search: str | None = None,
    sortBy: str = "createdAt",
    sortOrder: str = "desc",
    includeInactive: bool = False,
    current_user: dict | None = Depends(get_optional_user),
):


    page = max(
        page,
        1,
    )
    limit = min(
        max(limit, 1),
        100,
    )
    skip = (
        page - 1
    ) * limit


    search = (
        search.strip()
        if search
        else None
    )


    query = {
        "tenantId": tenantId,
    }


    allow_inactive = False
    if (
        includeInactive
        and current_user
        and current_user.get("role") in ("admin", "super_admin")
    ):
        try:
            admin_tenant_id(current_user, tenantId)
            allow_inactive = True
        except HTTPException:
            allow_inactive = False
    if not allow_inactive:
        query["isActive"] = True


    if categoryIds:
        query["categoryId"] = {
            "$in": categoryIds
        }


    if (
        minPrice is not None
        or maxPrice is not None
    ):
        query["finalPrice"] = {}
        if minPrice is not None:
            query["finalPrice"]["$gte"] = (
                minPrice
            )
        if maxPrice is not None:
            query["finalPrice"]["$lte"] = (
                maxPrice
            )


    if sizes and colors:
        query["inventory"] = {
            "$elemMatch": {
                "size": {
                    "$in": sizes
                },
                "color": {
                    "$in": colors
                },
                "stock": {
                    "$gt": 0
                },
            }
        }
    elif sizes:
        query["inventory"] = {
            "$elemMatch": {
                "size": {
                    "$in": sizes
                },
                "stock": {
                    "$gt": 0
                },
            }
        }
    elif colors:
        query["inventory"] = {
            "$elemMatch": {
                "color": {
                    "$in": colors
                },
                "stock": {
                    "$gt": 0
                },
            }
        }
    else:
        query["inventory"] = {
            "$elemMatch": {
                "stock": {
                    "$gt": 0
                }
            }
        }


    if rating is not None:
        query["averageRating"] = {
            "$gte": rating
        }


    if search:
        search_regex = re.escape(
            search
        )
        query["$or"] = [
            {
                "name": {
                    "$regex": search_regex,
                    "$options": "i",
                }
            },
            {
                "description": {
                    "$regex": search_regex,
                    "$options": "i",
                }
            },
            {
                "brand": {
                    "$regex": search_regex,
                    "$options": "i",
                }
            },
        ]


    allowed_sort_fields = {
        "createdAt": "createdAt",
        "price": "finalPrice",
        "rating": "averageRating",
        "discount": "discountPercentage",
        "name": "name",
    }
    sort_field = allowed_sort_fields.get(
        sortBy,
        "createdAt",
    )
    sort_order = (
        -1
        if sortOrder.lower() == "desc"
        else 1
    )


    try:
        total_count = products.count_documents(
            query
        )
    except Exception as e:
        print(
            "ERROR counting products:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to count products.",
        )


    try:
        cursor = (
            products.find(query)
            .sort(
                sort_field,
                sort_order,
            )
            .skip(skip)
            .limit(limit)
        )
        data = []
        for product in cursor:
            data.append(
                serialize_product(product)
            )
    except Exception as e:
        print(
            "ERROR fetching products:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch products.",
        )


    total_pages = (
        (
            total_count
            + limit
            - 1
        )
        // limit
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
        "hasNextPage": (
            page < total_pages
        ),
        "hasPreviousPage": (
            page > 1
        ),
        "data": data,
    }


@router.post("/search")
def search_product(
    request: ProductSearchRequest,
):


    query = {
        "tenantId": request.tenantId,
        "isActive": True,
    }


    if request.search:
        search = request.search.strip()
        if search:
            escaped_search = re.escape(
                search
            )
            query["$or"] = [
                {
                    "name": {
                        "$regex": escaped_search,
                        "$options": "i",
                    }
                },
                {
                    "description": {
                        "$regex": escaped_search,
                        "$options": "i",
                    }
                },
                {
                    "brand": {
                        "$regex": escaped_search,
                        "$options": "i",
                    }
                },
            ]


    if request.categoryIds:
        query["categoryId"] = {
            "$in": request.categoryIds
        }


    if (
        request.minPrice is not None
        or request.maxPrice is not None
    ):
        query["finalPrice"] = {}
        if request.minPrice is not None:
            query["finalPrice"]["$gte"] = (
                request.minPrice
            )
        if request.maxPrice is not None:
            query["finalPrice"]["$lte"] = (
                request.maxPrice
            )


    inventory_conditions = []
    if request.sizes:
        inventory_conditions.append(
            {
                "size": {
                    "$in": request.sizes
                }
            }
        )
    if request.colors:
        inventory_conditions.append(
            {
                "color": {
                    "$in": request.colors
                }
            }
        )
    inventory_conditions.append(
        {
            "stock": {
                "$gt": 0
            }
        }
    )
    query["inventory"] = {
        "$elemMatch": {
            "$and": inventory_conditions
        }
    }


    if request.rating is not None:
        query["averageRating"] = {
            "$gte": request.rating
        }


    allowed_sort_fields = {
        "createdAt": "createdAt",
        "price": "finalPrice",
        "rating": "averageRating",
        "discount": "discountPercentage",
        "name": "name",
    }
    sort_field = allowed_sort_fields.get(
        request.sortBy,
        "createdAt",
    )
    sort_direction = (
        1
        if request.sortOrder.lower() == "asc"
        else -1
    )


    page = max(
        request.page,
        1,
    )
    limit = min(
        max(
            request.limit,
            1,
        ),
        100,
    )
    skip = (
        page - 1
    ) * limit


    try:
        total_count = products.count_documents(
            query
        )
    except Exception as e:
        print(
            "ERROR searching product count:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to count products.",
        )


    try:
        cursor = (
            products.find(query)
            .sort(
                sort_field,
                sort_direction,
            )
            .skip(skip)
            .limit(limit)
        )
        data = []
        for product in cursor:
            data.append(
                serialize_product(product)
            )
    except Exception as e:
        print(
            "ERROR searching products:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to search products.",
        )


    total_pages = (
        (
            total_count
            + limit
            - 1
        )
        // limit
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
        "hasNextPage": (
            page < total_pages
        ),
        "hasPreviousPage": (
            page > 1
        ),
        "data": data,
    }


@router.get("/new-arrivals")
def get_new_arrivals(
    tenantId: str,
    limit: int = 10,
):
    limit = min(
        max(limit, 1),
        100,
    )
    query = {
        "tenantId": tenantId,
        "isActive": True,
        "inventory": {
            "$elemMatch": {
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
            .limit(limit)
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


@router.get("/{id}")
def get_product(
    id: str,
    tenantId: str,
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )
    query = {
        "_id": ObjectId(id),
        "tenantId": tenantId,
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
            detail="Product not found.",
        )
    product = serialize_product(
        product
    )
    return {
        "success": True,
        "data": product,
    }


@router.put("/{id}")
def update_product(
    id: str,
    product: UpdateProduct,
    current_user: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )
    tenant_id = admin_tenant_id(current_user, product.tenantId)
    db_product = products.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id,
        }
    )
    if not db_product:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )
    update_data = product.model_dump(
        exclude_unset=True,
        exclude_none=True,
    )
    update_data.pop(
        "tenantId",
        None,
    )


    if "name" in update_data:
        name = str(
            update_data["name"]
        ).strip()
        if not name:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Product name cannot be empty."
                ),
            )
        update_data["name"] = name


    if "price" in update_data:
        if update_data["price"] < 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Price cannot be negative."
                ),
            )


    if "discountPercentage" in update_data:
        discount = update_data[
            "discountPercentage"
        ]
        if discount < 0 or discount > 100:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Discount must be between "
                    "0 and 100."
                ),
            )


    inventory = None
    if "inventory" in update_data:
        inventory = update_data[
            "inventory"
        ]
        validate_inventory(
            inventory
        )

        for item in inventory:
            item["stock"] = int(
                item.get("stock", 0)
            )
        update_data[
            "totalStock"
        ] = calculate_total_stock(
            inventory
        )


    if "images" in update_data:
        images = update_data[
            "images"
        ]
        validate_images(
            images
        )
        inventory_for_validation = (
            inventory
            if inventory is not None
            else db_product.get(
                "inventory",
                [],
            )
        )
        validate_color_images_against_inventory(
            inventory_for_validation,
            images,
        )


    if (
        "price" in update_data
        or "discountPercentage" in update_data
    ):
        price = update_data.get(
            "price",
            db_product.get(
                "price",
                0,
            ),
        )
        discount = update_data.get(
            "discountPercentage",
            db_product.get(
                "discountPercentage",
                0,
            ),
        )
        update_data[
            "finalPrice"
        ] = calculate_final_price(
            price,
            discount,
        )


    update_data[
        "updatedAt"
    ] = datetime.now(
        timezone.utc
    )


    try:
        result = products.update_one(
            {
                "_id": ObjectId(id),
                "tenantId": tenant_id,
            },
            {
                "$set": update_data
            },
        )
    except Exception as e:
        print(
            "ERROR updating product:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to update product.",
        )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )
    return {
        "success": True,
        "message": (
            "Product updated successfully."
        ),
    }


@router.delete("/{id}")
def delete_product(
    id: str,
    tenantId: str,
    current_user: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )
    try:
        scoped_tenant = admin_tenant_id(current_user, tenantId)
        result = products.delete_one(
            {
                "_id": ObjectId(id),
                "tenantId": scoped_tenant,
            }
        )
    except Exception as e:
        print(
            "ERROR deleting product:",
            repr(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to delete product.",
        )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )
    return {
        "success": True,
        "message": (
            "Product deleted successfully."
        ),
    }


@router.get("/{id}/inventory")
def get_product_inventory(
    id: str,
    tenantId: str,
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )
    try:
        product = products.find_one(
            {
                "_id": ObjectId(id),
                "tenantId": tenantId,
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
            detail="Product not found.",
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


@router.post("/{id}/check-stock")
def check_variant_stock(
    id: str,
    request: VariantStockRequest,
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
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
            detail="Product not found.",
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
