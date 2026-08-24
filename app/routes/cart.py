from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, HTTPException
from app.database.mongo import carts, products
from app.models.cart import AddCart, UpdateCart
router = APIRouter(
    prefix="/cart",
    tags=["Cart"],
)
# ============================================================
# Helpers
# ============================================================
def get_object_id(value: str, field_name: str) -> ObjectId:
    """
    Safely convert string to MongoDB ObjectId.
    """
    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}.",
        )
    return ObjectId(value)
def get_variant(product: dict, variant_id: str):
    """
    Find a variant inside product inventory.
    """
    inventory = product.get("inventory", [])
    for variant in inventory:
        if variant.get("variantId") == variant_id:
            return variant
    return None
def get_variant_image(product: dict, color: str | None):
    """
    Get first image for the selected color.
    Product images structure:
    {
        "Yellow": ["url1", "url2"],
        "White": ["url1", "url2"]
    }
    """
    images = product.get("images", {})
    if isinstance(images, dict):
        if color and images.get(color):
            color_images = images[color]
            if isinstance(color_images, list) and color_images:
                return color_images[0]
        # fallback to first available color
        for color_images in images.values():
            if isinstance(color_images, list) and color_images:
                return color_images[0]
    # fallback
    if isinstance(images, list) and images:
        return images[0]
    return None
# ============================================================
# Add To Cart
# ============================================================
@router.post("/")
def add_to_cart(request: AddCart):
    product_id = get_object_id(
        request.productId,
        "productId",
    )
    user_id = get_object_id(
        request.userId,
        "userId",
    )
    # --------------------------------------------------------
    # Find product
    # --------------------------------------------------------
    product = products.find_one(
        {
            "_id": product_id,
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
    # Variant required
    # --------------------------------------------------------
    if not request.variantId:
        raise HTTPException(
            status_code=400,
            detail="variantId is required.",
        )
    # --------------------------------------------------------
    # Find variant
    # --------------------------------------------------------
    variant = get_variant(
        product,
        request.variantId,
    )
    if not variant:
        raise HTTPException(
            status_code=404,
            detail="Selected product variant not found.",
        )
    # --------------------------------------------------------
    # Variant stock
    # --------------------------------------------------------
    variant_stock = int(
        variant.get("stock", 0)
    )
    if variant_stock <= 0:
        raise HTTPException(
            status_code=400,
            detail="Selected variant is out of stock.",
        )
    if request.quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than zero.",
        )
    if request.quantity > variant_stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {variant_stock} items are "
                f"available for this variant."
            ),
        )
    # --------------------------------------------------------
    # Existing cart item
    #
    # IMPORTANT:
    #
    # productId + variantId
    #
    # because the same product can have:
    #
    # yellow-xs
    # yellow-s
    # white-xs
    #
    # --------------------------------------------------------
    existing = carts.find_one(
        {
            "tenantId": request.tenantId,
            "userId": user_id,
            "productId": product_id,
            "variantId": request.variantId,
        }
    )
    if existing:
        new_quantity = (
            existing.get("quantity", 0)
            + request.quantity
        )
        if new_quantity > variant_stock:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Only {variant_stock} items "
                    f"are available for this variant."
                ),
            )
        carts.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "quantity": new_quantity,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        return {
            "success": True,
            "message": "Cart updated successfully.",
        }
    # --------------------------------------------------------
    # Insert new cart item
    # --------------------------------------------------------
    carts.insert_one(
        {
            "tenantId": request.tenantId,
            "userId": user_id,
            "productId": product_id,
            "variantId": request.variantId,
            "color": variant.get("color"),
            "size": variant.get("size"),
            "quantity": request.quantity,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
    )
    return {
        "success": True,
        "message": "Product added to cart successfully.",
    }
# ============================================================
# Update Cart Quantity
# ============================================================
@router.put("/{productId}")
def update_cart(
    productId: str,
    request: UpdateCart,
):
    product_object_id = get_object_id(
        productId,
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
    # Find cart item
    #
    # Product can have multiple variants.
    #
    # We therefore use variantId from request.
    # --------------------------------------------------------
    query = {
        "tenantId": request.tenantId,
        "userId": user_object_id,
        "productId": product_object_id,
    }
    if getattr(request, "variantId", None):
        query["variantId"] = request.variantId
    cart = carts.find_one(query)
    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart.",
        )
    # --------------------------------------------------------
    # Remove
    # --------------------------------------------------------
    if request.quantity == 0:
        carts.delete_one(
            {
                "_id": cart["_id"],
            }
        )
        return {
            "success": True,
            "message": "Product removed from cart.",
        }
    # --------------------------------------------------------
    # Validate quantity
    # --------------------------------------------------------
    variant_id = cart.get("variantId")
    variant = get_variant(
        product,
        variant_id,
    )
    if not variant:
        raise HTTPException(
            status_code=404,
            detail="Cart variant no longer exists.",
        )
    variant_stock = int(
        variant.get("stock", 0)
    )
    if request.quantity > variant_stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {variant_stock} items "
                f"are available for this variant."
            ),
        )
    # --------------------------------------------------------
    # Update
    # --------------------------------------------------------
    carts.update_one(
        {
            "_id": cart["_id"],
        },
        {
            "$set": {
                "quantity": request.quantity,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    return {
        "success": True,
        "message": "Cart updated successfully.",
    }
# ============================================================
# Get Cart
# ============================================================
@router.get("/{userId}")
def get_cart(
    userId: str,
    tenantId: str,
):
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    cursor = carts.find(
        {
            "tenantId": tenantId,
            "userId": user_object_id,
        }
    )
    data = []
    grand_total = 0
    total_quantity = 0
    for item in cursor:
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
        # Get variant
        # ----------------------------------------------------
        variant_id = item.get("variantId")
        variant = get_variant(
            product,
            variant_id,
        )
        if not variant:
            continue
        quantity = int(
            item.get("quantity", 0)
        )
        # ----------------------------------------------------
        # Current variant stock
        # ----------------------------------------------------
        stock = int(
            variant.get("stock", 0)
        )
        # ----------------------------------------------------
        # Product price
        # ----------------------------------------------------
        price = float(
            product.get("finalPrice", 0)
        )
        subtotal = price * quantity
        grand_total += subtotal
        total_quantity += quantity
        # ----------------------------------------------------
        # Image for selected color
        # ----------------------------------------------------
        image = get_variant_image(
            product,
            variant.get("color"),
        )
        # ----------------------------------------------------
        # Response
        # ----------------------------------------------------
        data.append(
            {
                "cartId": str(item["_id"]),
                "productId": str(
                    product["_id"]
                ),
                "name": product.get(
                    "name",
                    "",
                ),
                "price": price,
                "quantity": quantity,
                "subtotal": subtotal,
                "variantId": variant.get(
                    "variantId"
                ),
                "color": variant.get(
                    "color"
                ),
                "size": variant.get(
                    "size"
                ),
                "stock": stock,
                "image": image,
            }
        )
    return {
        "success": True,
        "count": len(data),
        "totalQuantity": total_quantity,
        "grandTotal": grand_total,
        "data": data,
    }
# ============================================================
# Remove Product From Cart
# ============================================================
@router.delete("/{productId}")
def remove_from_cart(
    productId: str,
    userId: str,
    tenantId: str,
    variantId: str | None = None,
):
    product_object_id = get_object_id(
        productId,
        "productId",
    )
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    query = {
        "tenantId": tenantId,
        "userId": user_object_id,
        "productId": product_object_id,
    }
    if variantId:
        query["variantId"] = variantId
    result = carts.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart.",
        )
    return {
        "success": True,
        "message": "Product removed successfully.",
    }
# ============================================================
# Clear Cart
# ============================================================
@router.delete("/")
def clear_cart(
    userId: str,
    tenantId: str,
):
    user_object_id = get_object_id(
        userId,
        "userId",
    )
    result = carts.delete_many(
        {
            "tenantId": tenantId,
            "userId": user_object_id,
        }
    )
    return {
        "success": True,
        "message": "Cart cleared successfully.",
        "deletedItems": result.deleted_count,
    }
