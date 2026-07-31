from fastapi import APIRouter, HTTPException
from app.models.product import CreateProduct
from datetime import datetime
from bson import ObjectId
from app.database.mongo import products
router = APIRouter(
    prefix='/product',
    tags=['Product']
)

@router.post('/create-product')
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
        product.price * product.discountPercentage / 100
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
        "updatedAt": datetime.utcnow()
    }

    result = products.insert_one(payload)

    return {
        "success": True,
        "productId": str(result.inserted_id),
        "message": "Product created successfully."
    }

@router.get("/get-all-products")
def get_all_products(tenantId: str):

    data = []

    cursor = products.find({
        "tenantId": tenantId,
        "isActive": True
    })

    for product in cursor:
        product["_id"] = str(product["_id"])
        data.append(product)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.post('/{id}')
def get_product(id: str, tenantId: str):

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

    product["_id"] = str(product["_id"])

    return {
        "success": True,
        "data": product
    }

@router.put('/update-product/id')
def update_product(id: str, product: CreateProduct):

    update_data = product.model_dump(exclude_unset=True)

    if "price" in update_data or "discountPercentage" in update_data:

        db_product = products.find_one({
            "_id": ObjectId(id),
            "tenantId": product.tenantId
        })

        price = update_data.get("price", db_product["price"])
        discount = update_data.get(
            "discountPercentage",
            db_product["discountPercentage"]
        )

        update_data["finalPrice"] = (
            price - (price * discount / 100)
        )

    update_data["updatedAt"] = datetime.utcnow()

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
        "message": "Product updated successfully."
    }

@router.delete('/delete-product/id')
def delete_product(id: str, tenantId: str):

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
        "message": "Product deleted successfully."
    }

@router.post('/search')
def search_product(request:CreateProduct):
    query={
        "tenantId": request.tenantId,
        'isActive': True
    }

    if request.search:
        query["$or"] = [
            {
                "name": {
                    "$regex": request.search,
                    "$options": "i"
                }
            },
            {
                "description": {
                    "$regex": request.search,
                    "$options": "i"
                }
            }
    ]
    if(request.categoryIds):
        query["categoryId"] = {
            "$in": request.categoryIds
        }

    if(request.minPrice is not None or request.maxPrice is not None):
        query['finalPrice'] = {}

        if(request.minPrice is not None):
            query['finalPrice']['$gte'] = request.minPrice
        if(request.maxPrice is not None):
            query['finalPrice']['$lte'] = request.maxPrice

    if request.sizes:
        query["sizes"] = {
            "$in": request.sizes
        }

    if request.colors:
        query["colors"] = {
            "$in": request.colors
        }

    if request.inStock:
        query["stock"] = {
            "$gt": 0
        }

    sort_direction = 1 if request.sortOrder == "asc" else -1
    skip = (request.page - 1) * request.limit
    cursor = (
        products.find(query)
        .sort(request.sortBy, sort_direction)
        .skip(skip)
        .limit(request.limit)
    )

    data = []

    for product in cursor:
        product["_id"] = str(product["_id"])
        data.append(product)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.get("/new-arrivals")
def get_new_arrivals(tenantId: str, limit: int = 10):

    cursor = (
        products.find({
            "tenantId": tenantId,
            "isActive": True
        })
        .sort("createdAt", -1)
        .limit(limit)
    )

    data = []

    for product in cursor:
        product["_id"] = str(product["_id"])
        data.append(product)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }