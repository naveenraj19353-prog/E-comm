from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime
from app.models.wishlist import WishList
from app.database.mongo import products, wishlists

router= APIRouter(
    prefix='/wishlsit',
    tags=['Wishlist']
)

@router.post('')
def add_t0_wishlist(request: WishList):
    product = products.find_one({
        "_id": ObjectId(request.productId),
        "isActive": True
    })
    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )
    existing = wishlists.find_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId)
    })

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Product already exists in wishlists."
        )

    wishlists.insert_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId),
        "createdAt": datetime.utcnow()
    })

    return {
        "success": True,
        "message": "Product added to wishlists successfully."
    }

@router.get('/get-wishlist/{userId}')
def get_wishlist(userId:str, ):

    wishlist_data= wishlists.find({'userId':ObjectId(userId)})
    data = []

    for item in wishlist_data:

        product = products.find_one({
            "_id": item["productId"],
            "isActive": True
        })
        if product:
            product["_id"] = str(product["_id"])

            data.append({
                "wishlistId": str(item["_id"]),
                "product": product,
                "addedAt": item["createdAt"]
            })

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.delete('/delete-wishlist}')
def delete_wishlist(request:WishList):
    result = wishlists.delete_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId)
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Wishlist item not found."
        )

    return {
        "success": True,
        "message": "Product removed successfully."
    }

@router.delete("/user/{userId}")
def clear_wishlist(userId: str):

    result = wishlists.delete_many({
        "userId": ObjectId(userId)
    })

    return {
        "success": True,
        "message": "Wishlist cleared successfully.",
        "deletedCount": result.deleted_count
    }