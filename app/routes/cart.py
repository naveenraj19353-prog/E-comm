from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import carts, products
from app.models.cart import AddCart, UpdateCart

router = APIRouter(
    prefix="/cart",
    tags=["Cart"]
)


# --------------------------------------------------
# Add to Cart
# --------------------------------------------------
@router.post("/")
def add_to_cart(request: AddCart):

    product = products.find_one({
        "_id": ObjectId(request.productId),
        "tenantId": request.tenantId,
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
        "tenantId": request.tenantId,
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
            {
                "_id": existing["_id"]
            },
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
        "tenantId": request.tenantId,
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


# --------------------------------------------------
# Update Cart Quantity
# --------------------------------------------------
@router.put("/{productId}")
def update_cart(productId: str, request: UpdateCart):

    product = products.find_one({
        "_id": ObjectId(productId),
        "tenantId": request.tenantId,
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

    cart = carts.find_one({
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId),
        "productId": ObjectId(productId)
    })

    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart."
        )

    # Remove if quantity is zero
    if request.quantity == 0:

        carts.delete_one({
            "_id": cart["_id"]
        })

        return {
            "success": True,
            "message": "Product removed from cart."
        }

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


# --------------------------------------------------
# Get Cart
# --------------------------------------------------
@router.get("/{userId}")
def get_cart(userId: str, tenantId: str):

    cursor = carts.find({
        "tenantId": tenantId,
        "userId": ObjectId(userId)
    })

    data = []
    grand_total = 0

    for item in cursor:

        product = products.find_one({
            "_id": item["productId"],
            "tenantId": tenantId,
            "isActive": True
        })

        if product:

            subtotal = product["finalPrice"] * item["quantity"]

            grand_total += subtotal

            data.append({
                "cartId": str(item["_id"]),
                "productId": str(product["_id"]),
                "name": product["name"],
                "price": product["finalPrice"],
                "quantity": item["quantity"],
                "subtotal": subtotal,
                "image": product["images"][0]
            })

    return {
        "success": True,
        "count": len(data),
        "grandTotal": grand_total,
        "data": data
    }


# --------------------------------------------------
# Remove Product From Cart
# --------------------------------------------------
@router.delete("/{productId}")
def remove_from_cart(
    productId: str,
    userId: str,
    tenantId: str
):

    result = carts.delete_one({
        "tenantId": tenantId,
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
        "message": "Product removed successfully."
    }


# --------------------------------------------------
# Clear Cart
# --------------------------------------------------
@router.delete("/")
def clear_cart(userId: str, tenantId: str):

    result = carts.delete_many({
        "tenantId": tenantId,
        "userId": ObjectId(userId)
    })

    return {
        "success": True,
        "message": "Cart cleared successfully.",
        "deletedItems": result.deleted_count
    }