from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import products, wishlists
from app.models.wishlist import WishList

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])


# --------------------------------------------------
# Add Product to Wishlist
# --------------------------------------------------
@router.post("/")
def add_to_wishlist(request: WishList):

    product = products.find_one(
        {
            "_id": ObjectId(request.productId),
            "tenantId": request.tenantId,
            "isActive": True,
        }
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    existing = wishlists.find_one(
        {
            "tenantId": request.tenantId,
            "userId": ObjectId(request.userId),
            "productId": ObjectId(request.productId),
        }
    )

    if existing:
        raise HTTPException(
            status_code=409, detail="Product already exists in wishlist."
        )

    wishlists.insert_one(
        {
            "tenantId": request.tenantId,
            "userId": ObjectId(request.userId),
            "productId": ObjectId(request.productId),
            "createdAt": datetime.utcnow(),
        }
    )

    return {"success": True, "message": "Product added to wishlist successfully."}


# --------------------------------------------------
# Get Wishlist
# --------------------------------------------------
@router.get("/{userId}")
def get_wishlist(userId: str, tenantId: str):

    wishlist_items = wishlists.find({"tenantId": tenantId, "userId": ObjectId(userId)})

    data = []

    for item in wishlist_items:

        product = products.find_one(
            {"_id": item["productId"], "tenantId": tenantId, "isActive": True}
        )

        if product:

            data.append(
                {
                    "wishlistId": str(item["_id"]),
                    "productId": str(product["_id"]),
                    "name": product["name"],
                    "price": product["finalPrice"],
                    "image": product["images"][0],
                    "stock": product["stock"],
                    "addedAt": item["createdAt"],
                }
            )

    return {"success": True, "count": len(data), "data": data}


# --------------------------------------------------
# Remove Single Product
# --------------------------------------------------
@router.delete("/{productId}")
def remove_from_wishlist(productId: str, userId: str, tenantId: str):

    result = wishlists.delete_one(
        {
            "tenantId": tenantId,
            "userId": ObjectId(userId),
            "productId": ObjectId(productId),
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wishlist item not found.")

    return {"success": True, "message": "Product removed from wishlist successfully."}


# --------------------------------------------------
# Clear Wishlist
# --------------------------------------------------
@router.delete("/")
def clear_wishlist(userId: str, tenantId: str):

    result = wishlists.delete_many({"tenantId": tenantId, "userId": ObjectId(userId)})

    return {
        "success": True,
        "message": "Wishlist cleared successfully.",
        "deletedCount": result.deleted_count,
    }
