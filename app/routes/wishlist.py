from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, HTTPException
from app.database.mongo import products, wishlists
from app.models.wishlist import WishList
router = APIRouter(
    prefix="/wishlist",
    tags=["Wishlist"],
)
# ============================================================
# Helpers
# ============================================================
def get_object_id(
    value: str,
    field_name: str,
) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}.",
        )
    return ObjectId(value)
def get_total_stock(product: dict) -> int:
    inventory = product.get(
        "inventory",
        [],
    )
    return sum(
        max(
            0,
            int(item.get("stock", 0)),
        )
        for item in inventory
    )
def get_first_image(product: dict):
    images = product.get(
        "images",
        {},
    )
    # New format
    if isinstance(images, dict):
        for color_images in images.values():
            if (
                isinstance(
                    color_images,
                    list,
                )
                and color_images
            ):
                return color_images[0]
    # Old format fallback
    if isinstance(images, list) and images:
        return images[0]
    return None
# ============================================================
# Add Product To Wishlist
# ============================================================
@router.post("/")
def add_to_wishlist(
    request: WishList,
):
    product_object_id = get_object_id(
        request.productId,
        "productId",
    )
    user_object_id = get_object_id(
        request.userId,
        "userId",
    )
    # --------------------------------------------------------
    # Find product
    # --------------------------------------------------------
    product = products.find_one(
        {
            "_id": product_object_id,
            "tenantId": request.tenantId,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )
    # --------------------------------------------------------
    # Check existing
    # --------------------------------------------------------
    existing = wishlists.find_one(
        {
            "tenantId": request.tenantId,
            "userId": user_object_id,
            "productId": product_object_id,
        }
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Product already exists in wishlist.",
        )
    # --------------------------------------------------------
    # Insert
    # --------------------------------------------------------
    wishlists.insert_one(
        {
            "tenantId": request.tenantId,
            "userId": user_object_id,
            "productId": product_object_id,
            "createdAt": datetime.utcnow(),
        }
    )
    return {
        "success": True,
        "message": "Product added to wishlist successfully.",
    }
# ============================================================
# Get Wishlist
# ============================================================
@router.get("/{userId}")
def get_wishlist(
    userId: str,
    tenantId: str,
):
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    wishlist_items = wishlists.find(
        {
            "tenantId": tenantId,
            "userId": user_object_id,
        }
    )
    data = []
    for item in wishlist_items:
        product = products.find_one(
            {
                "_id": item["productId"],
                "tenantId": tenantId,
                "isActive": True,
            }
        )
        if not product:
            continue
        # ----------------------------------------------------
        # New inventory structure
        # ----------------------------------------------------
        total_stock = get_total_stock(
            product
        )
        # ----------------------------------------------------
        # New images structure
        # ----------------------------------------------------
        image = get_first_image(
            product
        )
        data.append(
            {
                "wishlistId": str(
                    item["_id"]
                ),
                "productId": str(
                    product["_id"]
                ),
                "name": product.get(
                    "name",
                    "",
                ),
                "price": product.get(
                    "finalPrice",
                    0,
                ),
                "image": image,
                "stock": total_stock,
                "totalStock": total_stock,
                "addedAt": item.get(
                    "createdAt"
                ),
            }
        )
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }
# ============================================================
# Remove Single Product
# ============================================================
@router.delete("/{productId}")
def remove_from_wishlist(
    productId: str,
    userId: str,
    tenantId: str,
):
    product_object_id = get_object_id(
        productId,
        "productId",
    )
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    result = wishlists.delete_one(
        {
            "tenantId": tenantId,
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
        "message": (
            "Product removed from wishlist successfully."
        ),
    }
# ============================================================
# Clear Wishlist
# ============================================================
@router.delete("/")
def clear_wishlist(
    userId: str,
    tenantId: str,
):
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    result = wishlists.delete_many(
        {
            "tenantId": tenantId,
            "userId": user_object_id,
        }
    )
    return {
        "success": True,
        "message": "Wishlist cleared successfully.",
        "deletedCount": result.deleted_count,
    }
