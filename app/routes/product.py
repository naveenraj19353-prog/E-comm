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