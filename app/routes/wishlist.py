from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import products, wishlists
from app.models.wishlist import WishList
from app.utils.auth_dependencies import customer_scope, require_customer
from app.utils.product_serialize import serialize_product

router = APIRouter(
    prefix="/wishlist",
    tags=["Wishlist"],
)


def get_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}.",
        )
    return ObjectId(value)


@router.post("/")
def add_to_wishlist(
    request: WishList,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    product_object_id = get_object_id(request.productId, "productId")
    user_object_id = get_object_id(user_id, "userId")
    product = products.find_one(
        {
            "_id": product_object_id,
            "tenantId": tenant_id,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    existing = wishlists.find_one(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
            "productId": product_object_id,
        }
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Product already exists in wishlist.",
        )
    wishlists.insert_one(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
            "productId": product_object_id,
            "createdAt": datetime.utcnow(),
        }
    )
    return {
        "success": True,
        "message": "Product added to wishlist successfully.",
    }


@router.get("/{userId}")
def get_wishlist(
    userId: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if userId != token_user_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another user's wishlist.",
        )
    user_object_id = get_object_id(token_user_id, "userId")
    wishlist_items = wishlists.find(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
        }
    )
    data = []
    for item in wishlist_items:
        product = products.find_one(
            {
                "_id": item["productId"],
                "tenantId": tenant_id,
                "isActive": True,
            }
        )
        if not product:
            continue
        serialized = serialize_product(product)
        data.append(
            {
                "wishlistId": str(item["_id"]),
                "productId": serialized["_id"],
                "name": serialized.get("name", ""),
                "price": serialized.get("price", 0),
                "finalPrice": serialized.get("finalPrice", 0),
                "discountPercentage": serialized.get(
                    "discountPercentage",
                    0,
                ),
                "images": serialized.get("images", {}),
                "inventory": serialized.get("inventory", []),
                "stock": serialized.get("totalStock", 0),
                "totalStock": serialized.get("totalStock", 0),
                "averageRating": serialized.get("averageRating", 0),
                "reviewCount": serialized.get("reviewCount", 0),
                "isActive": serialized.get("isActive", True),
                "addedAt": item.get("createdAt"),
            }
        )
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.delete("/{productId}")
def remove_from_wishlist(
    productId: str,
    userId: str | None = None,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    product_object_id = get_object_id(productId, "productId")
    user_object_id = get_object_id(token_user_id, "userId")
    result = wishlists.delete_one(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
            "productId": product_object_id,
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Wishlist item not found.",
        )
    return {
        "success": True,
        "message": "Product removed from wishlist successfully.",
    }


@router.delete("/")
def clear_wishlist(
    userId: str | None = None,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    user_object_id = get_object_id(token_user_id, "userId")
    result = wishlists.delete_many(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
        }
    )
    return {
        "success": True,
        "message": "Wishlist cleared successfully.",
        "deletedCount": result.deleted_count,
    }
