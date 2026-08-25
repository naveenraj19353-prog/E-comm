from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import carts
from app.models.cart import AddCart, UpdateCart
from app.utils.auth_dependencies import customer_scope, require_customer
from app.services.checkout_service import (
    cart_owner_query,
    find_active_product,
    product_id_query,
    get_variant,
    get_variant_image,
)

router = APIRouter(
    prefix="/cart",
    tags=["Cart"],
)


def get_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}.",
        )
    return ObjectId(value)


@router.post("/")
def add_to_cart(
    request: AddCart,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    product_id = get_object_id(request.productId, "productId")
    user_object_id = get_object_id(user_id, "userId")
    product = find_active_product(product_id, tenant_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if not request.variantId:
        raise HTTPException(status_code=400, detail="variantId is required.")
    variant = get_variant(product, request.variantId)
    if not variant:
        raise HTTPException(
            status_code=404,
            detail="Selected product variant not found.",
        )
    variant_stock = int(variant.get("stock", 0) or 0)
    if variant_stock <= 0:
        raise HTTPException(
            status_code=400,
            detail="Selected variant is out of stock.",
        )
    if request.quantity > variant_stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {variant_stock} items are "
                f"available for this variant."
            ),
        )
    existing = carts.find_one(
        {
            **cart_owner_query(tenant_id, user_id),
            "productId": product_id_query(product_id),
            "variantId": request.variantId,
        }
    )
    if existing:
        new_quantity = existing.get("quantity", 0) + request.quantity
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
    carts.insert_one(
        {
            "tenantId": tenant_id,
            "userId": user_object_id,
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


@router.put("/{productId}")
def update_cart(
    productId: str,
    request: UpdateCart,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    product_object_id = get_object_id(productId, "productId")
    product = find_active_product(product_object_id, tenant_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    query = {
        **cart_owner_query(tenant_id, user_id),
        "productId": product_id_query(product_object_id),
    }
    if request.variantId:
        query["variantId"] = request.variantId
    cart = carts.find_one(query)
    if not cart:
        raise HTTPException(
            status_code=404,
            detail="Product not found in cart.",
        )
    if request.quantity == 0:
        carts.delete_one({"_id": cart["_id"]})
        return {
            "success": True,
            "message": "Product removed from cart.",
        }
    variant = get_variant(product, cart.get("variantId"))
    if not variant:
        raise HTTPException(
            status_code=404,
            detail="Cart variant no longer exists.",
        )
    stock = int(variant.get("stock", 0) or 0)
    if request.quantity > stock:
        raise HTTPException(
            status_code=400,
            detail=f"Only {stock} items are available for this variant.",
        )
    carts.update_one(
        {"_id": cart["_id"]},
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


@router.get("/{userId}")
def get_cart(
    userId: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if userId != token_user_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another user's cart.",
        )
    cursor = carts.find(cart_owner_query(tenant_id, token_user_id))
    data = []
    grand_total = 0
    total_quantity = 0
    for item in cursor:
        product = find_active_product(item.get("productId"), tenant_id)
        if not product:
            carts.delete_one({"_id": item["_id"]})
            continue
        variant = get_variant(product, item.get("variantId"))
        if not variant:
            carts.delete_one({"_id": item["_id"]})
            continue
        quantity = int(item.get("quantity", 0))
        stock = int(variant.get("stock", 0) or 0)
        price = float(product.get("finalPrice", 0))
        subtotal = price * quantity
        grand_total += subtotal
        total_quantity += quantity
        data.append(
            {
                "cartId": str(item["_id"]),
                "productId": str(product["_id"]),
                "name": product.get("name", ""),
                "price": price,
                "quantity": quantity,
                "subtotal": subtotal,
                "variantId": variant.get("variantId"),
                "color": variant.get("color"),
                "size": variant.get("size"),
                "stock": stock,
                "image": get_variant_image(product, variant.get("color")),
            }
        )
    return {
        "success": True,
        "count": len(data),
        "totalQuantity": total_quantity,
        "grandTotal": grand_total,
        "data": data,
    }


@router.delete("/{productId}")
def remove_from_cart(
    productId: str,
    userId: str | None = None,
    tenantId: str | None = None,
    variantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    product_object_id = get_object_id(productId, "productId")
    query = {
        **cart_owner_query(tenant_id, token_user_id),
        "productId": product_id_query(product_object_id),
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


@router.delete("/")
def clear_cart(
    userId: str | None = None,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    result = carts.delete_many(cart_owner_query(tenant_id, token_user_id))
    return {
        "success": True,
        "message": "Cart cleared successfully.",
        "deletedItems": result.deleted_count,
    }
