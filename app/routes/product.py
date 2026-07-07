from fastapi import APIRouter, HTTPException
from app.models.product import CreateProduct, ProductSearchRequest
from datetime import datetime
from bson import ObjectId
from app.database.mongo import products
router = APIRouter(
    prefix='/product',
    tags=['Product']
)

@router.post('/create-product')
def  product_create(product: CreateProduct):

    existingProduct = products.find_one({
        'name' : product.name,
        'categoryId' : product.categoryId
    })

    if(existingProduct):
        raise HTTPException(status_code=400, detail="Product already exist")
    else:
        final_price = product.price - (product.price * product.discountPercentage / 100)
        product_data = {
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

        products.insert_one(product_data)
        return {
            'message': 'Product Added Successfully',
            'statusCode':200
        }
    
@router.get('/get-all-products')
def get_all_products():

    products_data =[]

    for product in products.find():
        product['_id'] = str(product['_id'])
        products_data.append(product)

    return products_data

@router.post('/get-product/id')
def get_product(id):

    product_data =[]

    for product in products.find({'_id':ObjectId(id)}):
        product['_id'] = str(product['_id'])
        product_data.append(product)

    return product_data

@router.put('/update-product/id')
def update_product(id:str, product: CreateProduct):
    update_data = product.model_dump(exclude_unset=True)
    if "price" in update_data and "discountPercentage" in update_data:
        update_data["finalPrice"] = (update_data["price"] - (update_data["price"] * update_data["discountPercentage"] / 100))

    update_data["updatedAt"] = datetime.utcnow()
    result = products.update_one(
        {"_id": ObjectId(id)},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "success": True,
        "message": "Product updated successfully"
    }

@router.delete('/delete-product/id')
def delete_product(id: str):
    result = products.delete_one(
        {"_id": ObjectId(id)}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return {
        "success": True,
        "message": "Product deleted permanently"
    }

@router.post('/search')
def search_product(request:ProductSearchRequest):
    query={
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
        query['categoryIds'] = {
            '$in': [ObjectId(id) for id in request.categoryIds]
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
def get_new_arrivals(limit: int = 10):

    cursor = (
        products.find({"isActive": True})
        .sort("createdAt", -1)
        .limit(limit)
    )

    data = []

    for product in cursor:
        product["_id"] = str(product["_id"])
        data.append(product)

    return {
        "success": True,
        "message": "New arrivals fetched successfully.",
        "count": len(data),
        "data": data
    }