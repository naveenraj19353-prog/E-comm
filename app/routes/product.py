from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from app.database.mongo import products
from app.models.product import CreateProduct, UpdateProduct


router = APIRouter(
    prefix="/product",
    tags=["Product"],
)


# =========================================================
# CREATE PRODUCT
# =========================================================

@router.post("/create-product")
def create_product(product: CreateProduct):

    existing = products.find_one(
        {
            "tenantId": product.tenantId,
            "name": product.name,
            "categoryId": product.categoryId,
        }
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Product already exists.",
        )

    if product.price < 0:
        raise HTTPException(
            status_code=400,
            detail="Price cannot be negative.",
        )

    if product.discountPercentage < 0 or product.discountPercentage > 100:
        raise HTTPException(
            status_code=400,
            detail="Discount must be between 0 and 100.",
        )

    if product.stock < 0:
        raise HTTPException(
            status_code=400,
            detail="Stock cannot be negative.",
        )

    final_price = product.price - (
        product.price * product.discountPercentage / 100
    )

    now = datetime.utcnow()

    payload = {
        "tenantId": product.tenantId,
        "name": product.name,
        "description": product.description,
        "categoryId": product.categoryId,
        "price": product.price,
        "discountPercentage": product.discountPercentage,
        "finalPrice": final_price,
        "stock": product.stock,
        "sizes": product.sizes,
        "colors": product.colors,
        "images": product.images,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
        "averageRating": 0,
        "reviewCount": 0,
    }

    result = products.insert_one(payload)

    return {
        "success": True,
        "productId": str(result.inserted_id),
        "message": "Product created successfully.",
    }


# =========================================================
# GET ALL PRODUCTS
# ADMIN + STOREFRONT
# =========================================================

@router.get("/get-all-products")
def get_all_products(
    tenantId: str,
    page: int = 1,
    limit: int = 20,

    categoryIds: list[str] | None = Query(default=None),

    minPrice: float | None = None,
    maxPrice: float | None = None,

    sizes: list[str] | None = Query(default=None),

    colors: list[str] | None = Query(default=None),

    rating: float | None = None,

    search: str | None = None,

    sortBy: str = "createdAt",
    sortOrder: str = "desc",

    includeInactive: bool = False,
):
    if page < 1:
        page = 1

    if limit < 1:
        limit = 20

    if limit > 100:
        limit = 100

    skip = (page - 1) * limit

    search = search.strip() if search else None

    query = {
        "tenantId": tenantId,
    }

    # -----------------------------------------------------
    # ACTIVE / INACTIVE
    # -----------------------------------------------------

    if not includeInactive:
        query["isActive"] = True

    # -----------------------------------------------------
    # CATEGORY
    # -----------------------------------------------------

    if categoryIds:
        query["categoryId"] = {
            "$in": categoryIds
        }

    # -----------------------------------------------------
    # PRICE
    # -----------------------------------------------------

    if minPrice is not None or maxPrice is not None:

        query["finalPrice"] = {}

        if minPrice is not None:
            query["finalPrice"]["$gte"] = minPrice

        if maxPrice is not None:
            query["finalPrice"]["$lte"] = maxPrice

    # -----------------------------------------------------
    # SIZE
    # -----------------------------------------------------

    if sizes:
        query["sizes"] = {
            "$in": sizes
        }

    # -----------------------------------------------------
    # COLOR
    # -----------------------------------------------------

    if colors:
        query["colors"] = {
            "$in": colors
        }

    # -----------------------------------------------------
    # RATING
    # -----------------------------------------------------

    if rating is not None:
        query["averageRating"] = {
            "$gte": rating
        }

    # -----------------------------------------------------
    # SEARCH
    # -----------------------------------------------------

    if search:

        query["$or"] = [
            {
                "name": {
                    "$regex": search,
                    "$options": "i",
                }
            },
            {
                "description": {
                    "$regex": search,
                    "$options": "i",
                }
            },
        ]

    # -----------------------------------------------------
    # SORT
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # COUNT
    # -----------------------------------------------------

    total_count = products.count_documents(query)

    # -----------------------------------------------------
    # FETCH
    # -----------------------------------------------------

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

        product["_id"] = str(
            product["_id"]
        )

        data.append(product)

    # -----------------------------------------------------
    # PAGES
    # -----------------------------------------------------

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
        "data": data,
    }


# =========================================================
# GET SINGLE PRODUCT
# =========================================================

@router.get("/{id}")
def get_product(
    id: str,
    tenantId: str,
    includeInactive: bool = False,
):

    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )

    query = {
        "_id": ObjectId(id),
        "tenantId": tenantId,
    }

    if not includeInactive:
        query["isActive"] = True

    product = products.find_one(query)

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    product["_id"] = str(
        product["_id"]
    )

    return {
        "success": True,
        "data": product,
    }


# =========================================================
# UPDATE PRODUCT
# =========================================================

@router.put("/{id}")
def update_product(
    id: str,
    product: UpdateProduct,
):

    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )

    db_product = products.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": product.tenantId,
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

    # -----------------------------------------------------
    # VALIDATE NAME
    # -----------------------------------------------------

    if "name" in update_data:

        name = update_data["name"].strip()

        if not name:

            raise HTTPException(
                status_code=400,
                detail="Product name cannot be empty.",
            )

        update_data["name"] = name

    # -----------------------------------------------------
    # VALIDATE PRICE
    # -----------------------------------------------------

    if "price" in update_data:

        if update_data["price"] < 0:

            raise HTTPException(
                status_code=400,
                detail="Price cannot be negative.",
            )

    # -----------------------------------------------------
    # VALIDATE DISCOUNT
    # -----------------------------------------------------

    if "discountPercentage" in update_data:

        discount = update_data[
            "discountPercentage"
        ]

        if discount < 0 or discount > 100:

            raise HTTPException(
                status_code=400,
                detail="Discount must be between 0 and 100.",
            )

    # -----------------------------------------------------
    # VALIDATE STOCK
    # -----------------------------------------------------

    if "stock" in update_data:

        if update_data["stock"] < 0:

            raise HTTPException(
                status_code=400,
                detail="Stock cannot be negative.",
            )

    # -----------------------------------------------------
    # FINAL PRICE
    # -----------------------------------------------------

    if (
        "price" in update_data
        or "discountPercentage" in update_data
    ):

        price = update_data.get(
            "price",
            db_product.get("price", 0),
        )

        discount = update_data.get(
            "discountPercentage",
            db_product.get(
                "discountPercentage",
                0,
            ),
        )

        update_data["finalPrice"] = (
            price
            - (
                price
                * discount
                / 100
            )
        )

    # -----------------------------------------------------
    # UPDATED TIME
    # -----------------------------------------------------

    update_data["updatedAt"] = datetime.utcnow()

    # -----------------------------------------------------
    # UPDATE
    # -----------------------------------------------------

    result = products.update_one(
        {
            "_id": ObjectId(id),
            "tenantId": product.tenantId,
        },
        {
            "$set": update_data
        },
    )

    if result.matched_count == 0:

        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return {
        "success": True,
        "message": "Product updated successfully.",
    }


# =========================================================
# DELETE PRODUCT
# =========================================================

@router.delete("/{id}")
def delete_product(
    id: str,
    tenantId: str,
):

    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID.",
        )

    result = products.delete_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenantId,
        }
    )

    if result.deleted_count == 0:

        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return {
        "success": True,
        "message": "Product deleted successfully.",
    }


# =========================================================
# SEARCH PRODUCTS
# =========================================================

@router.post("/search")
def search_product(
    request: CreateProduct,
):

    query = {
        "tenantId": request.tenantId,
        "isActive": True,
    }

    # -----------------------------------------------------
    # SEARCH
    # -----------------------------------------------------

    if request.search:

        query["$or"] = [
            {
                "name": {
                    "$regex": request.search,
                    "$options": "i",
                }
            },
            {
                "description": {
                    "$regex": request.search,
                    "$options": "i",
                }
            },
        ]

    # -----------------------------------------------------
    # CATEGORY
    # -----------------------------------------------------

    if request.categoryIds:

        query["categoryId"] = {
            "$in": request.categoryIds
        }

    # -----------------------------------------------------
    # PRICE
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # SIZE
    # -----------------------------------------------------

    if request.sizes:

        query["sizes"] = {
            "$in": request.sizes
        }

    # -----------------------------------------------------
    # COLOR
    # -----------------------------------------------------

    if request.colors:

        query["colors"] = {
            "$in": request.colors
        }

    # -----------------------------------------------------
    # STOCK
    # -----------------------------------------------------

    if request.inStock:

        query["stock"] = {
            "$gt": 0
        }

    # -----------------------------------------------------
    # RATING
    # -----------------------------------------------------

    if request.rating is not None:

        query["averageRating"] = {
            "$gte": request.rating
        }

    # -----------------------------------------------------
    # SORT
    # -----------------------------------------------------

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
        if request.sortOrder == "asc"
        else -1
    )

    # -----------------------------------------------------
    # PAGINATION
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # COUNT
    # -----------------------------------------------------

    total_count = products.count_documents(
        query
    )

    # -----------------------------------------------------
    # PRODUCTS
    # -----------------------------------------------------

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

        product["_id"] = str(
            product["_id"]
        )

        data.append(product)

    # -----------------------------------------------------
    # TOTAL PAGES
    # -----------------------------------------------------

    total_pages = (
        (total_count + limit - 1)
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
        "hasNextPage": page < total_pages,
        "hasPreviousPage": page > 1,
        "data": data,
    }


# =========================================================
# NEW ARRIVALS
# =========================================================

@router.get("/new-arrivals")
def get_new_arrivals(
    tenantId: str,
    limit: int = 10,
):

    if limit < 1:
        limit = 10

    if limit > 100:
        limit = 100

    cursor = (
        products.find(
            {
                "tenantId": tenantId,
                "isActive": True,
            }
        )
        .sort(
            "createdAt",
            -1,
        )
        .limit(limit)
    )

    data = []

    for product in cursor:

        product["_id"] = str(
            product["_id"]
        )

        data.append(product)

    return {
        "success": True,
        "count": len(data),
        "data": data,
    }