from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import carts, products
from app.models.cart import AddCart

router = APIRouter(
    prefix="/cart",
    tags=["Cart"]
)

@router.post("/add-to-cart")
def add_to_cart(request: AddCart):

    product = products.find_one({
        "_id": ObjectId(request.productId),
        "isActive": True
    })

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    if request.quantity > product["stock"]:
        raise HTTPException(
            status_code=400,
            detail="Requested quantity exceeds available stock."
        )

    existing = carts.find_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId)
    })

    if existing:

        new_quantity = existing["quantity"] + request.quantity

        if new_quantity > product["stock"]:
            raise HTTPException(
                status_code=400,
                detail="Requested quantity exceeds available stock."
            )

        carts.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "quantity": new_quantity,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        return {
            "success": True,
            "message": "Cart updated successfully."
        }

    carts.insert_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId),
        "quantity": request.quantity,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    })

    return {
        "success": True,
        "message": "Product added to cart successfully."
    }

@router.put("/update/{productId}")
def update_cart(productId: str, request: AddCart):

    # Check if product exists
    product = products.find_one({
        "_id": ObjectId(productId),
        "isActive": True
    })

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    # Check stock
    if request.quantity > product["stock"]:
        raise HTTPException(
            status_code=400,
            detail="Requested quantity exceeds available stock."
        )

    # Check if product exists in cart
    cart = carts.find_one({
        "userId": ObjectId(request.userId),
        "productId": ObjectId(productId)
    })

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart."
        )

    carts.update_one(
        {
            "_id": cart["_id"]
        },
        {
            "$set": {
                "quantity": request.quantity,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    return {
        "success": True,
        "message": "Cart updated successfully."
    }

@router.get("/get-cart/{userId}")
def get_cart(userId: str):

    cursor = carts.find({
        "userId": ObjectId(userId)
    })

    data = []

    for item in cursor:
        item["_id"] = str(item["_id"])
        item["userId"] = str(item["userId"])
        item["productId"] = str(item["productId"])
        data.append(item)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.delete("/delete{productId}")
def remove_from_cart(productId: str, userId: str):

    result = carts.delete_one({
        "userId": ObjectId(userId),
        "productId": ObjectId(productId)
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart."
        )

    return {
        "success": True,
        "message": "Product removed from cart successfully."
    }

@router.delete("/clear-cart")
def remove_from_cart( userId: str):

    result = carts.delete_many({
        "userId": ObjectId(userId),
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart."
        )

    return {
        "success": True,
        "message": "All product removed from cart successfully."
    }