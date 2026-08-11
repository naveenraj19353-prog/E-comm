from fastapi import APIRouter, HTTPException, Query
from app.models.product import CreateProduct
from app.database.mongo import products
from datetime import datetime
from bson import ObjectId

router = APIRouter(
    prefix="/product",
    tags=["Product"]
)

@router.post("/create-product")
def create_product(product: CreateProduct):

    existing = products.find_one({
        "tenantId": product.tenantId,
        "name": product.name,
        "categoryId": product.categoryId
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Product already exists."
        )

    final_price = product.price - (
        product.price *
        product.discountPercentage / 100
    )

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

        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),

        # Default review values
        "averageRating": 0,
        "reviewCount": 0
    }

    result = products.insert_one(payload)

    return {
        "success": True,
        "productId": str(result.inserted_id),
        "message": "Product created successfully."
    }


# =========================================================
# GET ALL PRODUCTS
# Filters + Search + Sorting + Infinite Scroll
# =========================================================

@router.get("/get-all-products")
def get_all_products(
    tenantId: str,

    # -----------------------------------------------------
    # Pagination
    # -----------------------------------------------------

    page: int = 1,
    limit: int = 20,

    # -----------------------------------------------------
    # Category
    # Example:
    # categoryIds=BOOKS&categoryIds=SPORTS
    # -----------------------------------------------------

    categoryIds: list[str] | None = Query(
        default=None
    ),

    # -----------------------------------------------------
    # Price
    # -----------------------------------------------------

    minPrice: float | None = None,
    maxPrice: float | None = None,

    # -----------------------------------------------------
    # Sizes
    # Example:
    # sizes=M&sizes=L
    # -----------------------------------------------------

    sizes: list[str] | None = Query(
        default=None
    ),

    # -----------------------------------------------------
    # Colors
    # Example:
    # colors=Black&colors=Blue
    # -----------------------------------------------------

    colors: list[str] | None = Query(
        default=None
    ),

    # -----------------------------------------------------
    # Rating
    # Example:
    # rating=4
    # means 4 and above
    # -----------------------------------------------------

    rating: float | None = None,

    # -----------------------------------------------------
    # Search
    # -----------------------------------------------------

    search: str | None = None,

    # -----------------------------------------------------
    # Sorting
    # -----------------------------------------------------

    sortBy: str = "createdAt",
    sortOrder: str = "desc",
):
    # =====================================================
    # VALIDATE PAGINATION
    # =====================================================

    if page < 1:
        page = 1

    if limit < 1:
        limit = 20

    if limit > 100:
        limit = 100

    skip = (page - 1) * limit

    # =====================================================
    # CLEAN SEARCH
    # =====================================================

    search = search.strip() if search else None

    # =====================================================
    # BASE QUERY
    # =====================================================

    query = {
        "tenantId": tenantId,
        "isActive": True,
    }

    # =====================================================
    # CATEGORY FILTER
    #
    # IMPORTANT:
    #
    # If SEARCH exists, don't apply category.
    #
    # Example:
    #
    # categoryIds=ELECTRONICS
    # search=mobile
    #
    # category will be ignored.
    # =====================================================

    if categoryIds and not search:

        query["categoryId"] = {
            "$in": categoryIds
        }

    # =====================================================
    # PRICE FILTER
    # =====================================================

    if minPrice is not None or maxPrice is not None:

        query["finalPrice"] = {}

        if minPrice is not None:
            query["finalPrice"]["$gte"] = minPrice

        if maxPrice is not None:
            query["finalPrice"]["$lte"] = maxPrice

    # =====================================================
    # SIZE FILTER
    # =====================================================

    if sizes:

        query["sizes"] = {
            "$in": sizes
        }

    # =====================================================
    # COLOR FILTER
    # =====================================================

    if colors:

        query["colors"] = {
            "$in": colors
        }

    # =====================================================
    # RATING FILTER
    # =====================================================

    if rating is not None:

        query["averageRating"] = {
            "$gte": rating
        }

    # =====================================================
    # SEARCH
    # =====================================================

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

    # =====================================================
    # SORTING
    # =====================================================

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

    # =====================================================
    # TOTAL FILTERED COUNT
    # =====================================================

    total_count = products.count_documents(
        query
    )

    # =====================================================
    # GET CURRENT PAGE
    # =====================================================

    cursor = (
        products
        .find(query)
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

    # =====================================================
    # TOTAL PAGES
    # =====================================================

    total_pages = (
        (total_count + limit - 1) // limit
        if total_count > 0
        else 0
    )

    # =====================================================
    # RESPONSE
    # =====================================================

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
    tenantId: str
):

    # Validate ObjectId
    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID."
        )

    product = products.find_one({

        "_id": ObjectId(id),

        "tenantId": tenantId,

        "isActive": True
    })

    if not product:

        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    product["_id"] = str(
        product["_id"]
    )

    return {

        "success": True,

        "data": product
    }


# =========================================================
# UPDATE PRODUCT
# =========================================================

@router.put("/{id}")
def update_product(
    id: str,
    product: CreateProduct
):

    # Validate ObjectId
    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID."
        )

    # -----------------------------------------------------
    # Find existing product
    # -----------------------------------------------------

    db_product = products.find_one({

        "_id": ObjectId(id),

        "tenantId": product.tenantId
    })

    if not db_product:

        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    # -----------------------------------------------------
    # Convert request to dictionary
    # -----------------------------------------------------

    update_data = product.model_dump(
        exclude_unset=True
    )

    # -----------------------------------------------------
    # Recalculate final price
    # -----------------------------------------------------

    if (
        "price" in update_data
        or
        "discountPercentage" in update_data
    ):

        price = update_data.get(
            "price",
            db_product["price"]
        )

        discount = update_data.get(
            "discountPercentage",
            db_product["discountPercentage"]
        )

        update_data["finalPrice"] = (
            price -
            (
                price *
                discount /
                100
            )
        )

    # -----------------------------------------------------
    # Updated time
    # -----------------------------------------------------

    update_data["updatedAt"] = (
        datetime.utcnow()
    )

    # -----------------------------------------------------
    # Update MongoDB
    # -----------------------------------------------------

    result = products.update_one(

        {
            "_id": ObjectId(id),

            "tenantId": product.tenantId
        },

        {
            "$set": update_data
        }
    )

    if result.matched_count == 0:

        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    return {

        "success": True,

        "message":
            "Product updated successfully."
    }


# =========================================================
# DELETE PRODUCT
# =========================================================

@router.delete("/{id}")
def delete_product(
    id: str,
    tenantId: str
):

    # Validate ObjectId
    if not ObjectId.is_valid(id):

        raise HTTPException(
            status_code=400,
            detail="Invalid product ID."
        )

    result = products.delete_one({

        "_id": ObjectId(id),

        "tenantId": tenantId
    })

    if result.deleted_count == 0:

        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    return {

        "success": True,

        "message":
            "Product deleted successfully."
    }


# =========================================================
# SEARCH PRODUCTS
#
# Optional.
#
# Your frontend PLP can use get-all-products with
# search instead, so this endpoint is not required
# for the PLP.
# =========================================================

@router.post("/search")
def search_product(
    request: CreateProduct
):

    query = {

        "tenantId":
            request.tenantId,

        "isActive": True
    }

    # -----------------------------------------------------
    # Search text
    # -----------------------------------------------------

    if request.search:

        query["$or"] = [

            {
                "name": {
                    "$regex":
                        request.search,

                    "$options": "i"
                }
            },

            {
                "description": {
                    "$regex":
                        request.search,

                    "$options": "i"
                }
            }
        ]

    # -----------------------------------------------------
    # Categories
    # -----------------------------------------------------

    if request.categoryIds:

        query["categoryId"] = {

            "$in":
                request.categoryIds
        }

    # -----------------------------------------------------
    # Price
    # -----------------------------------------------------

    if (
        request.minPrice is not None
        or
        request.maxPrice is not None
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
    # Sizes
    # -----------------------------------------------------

    if request.sizes:

        query["sizes"] = {

            "$in":
                request.sizes
        }

    # -----------------------------------------------------
    # Colors
    # -----------------------------------------------------

    if request.colors:

        query["colors"] = {

            "$in":
                request.colors
        }

    # -----------------------------------------------------
    # Stock
    # -----------------------------------------------------

    if request.inStock:

        query["stock"] = {

            "$gt": 0
        }

    # -----------------------------------------------------
    # Rating
    # -----------------------------------------------------

    if request.rating is not None:

        query["averageRating"] = {

            "$gte":
                request.rating
        }

    # -----------------------------------------------------
    # Sort
    # -----------------------------------------------------

    allowed_sort_fields = { 
    "createdAt": "createdAt",
    "price": "finalPrice",
    "rating": "averageRating",
    "discount": "discountPercentage",
    "name": "name"
    }

    sort_field = allowed_sort_fields.get(

        request.sortBy,

        "createdAt"
    )

    sort_direction = (

        1
        if request.sortOrder == "asc"
        else -1
    )

    # -----------------------------------------------------
    # Pagination
    # -----------------------------------------------------

    page = max(
        request.page,
        1
    )

    limit = min(
        max(request.limit, 1),
        100
    )

    skip = (
        page - 1
    ) * limit

    # -----------------------------------------------------
    # Total filtered count
    # -----------------------------------------------------

    total_count = products.count_documents(
        query
    )

    # -----------------------------------------------------
    # Products
    # -----------------------------------------------------

    cursor = (

        products
        .find(query)
        .sort(
            sort_field,
            sort_direction
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
    # Total pages
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

        "totalCount":
            total_count,

        "page":
            page,

        "limit":
            limit,

        "totalPages":
            total_pages,

        "hasNextPage":
            page < total_pages,

        "hasPreviousPage":
            page > 1,

        "data":
            data
    }


# =========================================================
# NEW ARRIVALS
# =========================================================

@router.get("/new-arrivals")
def get_new_arrivals(
    tenantId: str,
    limit: int = 10
):

    if limit < 1:
        limit = 10

    if limit > 100:
        limit = 100

    cursor = (

        products
        .find({

            "tenantId":
                tenantId,

            "isActive":
                True
        })

        .sort(
            "createdAt",
            -1
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

        "count":
            len(data),

        "data":
            data
    }