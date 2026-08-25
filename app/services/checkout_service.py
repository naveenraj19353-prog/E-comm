from fastapi import HTTPException
from bson import ObjectId
from datetime import datetime
import re
from app.database.mongo import (
    carts,
    products,
    addresses,
    coupons,
)


def normalize_tenant_id(value) -> str:
    return str(value or "").strip().lower()


def tenant_id_query(tenant_id: str) -> dict:
    normalized = re.escape(normalize_tenant_id(tenant_id))
    return {
        "$regex": f"^{normalized}$",
        "$options": "i",
    }


def as_object_id(value):
    if isinstance(value, ObjectId):
        return value
    value_str = str(value)
    if ObjectId.is_valid(value_str):
        return ObjectId(value_str)
    return None


def cart_owner_query(tenant_id: str, user_id: str) -> dict:
    object_id = as_object_id(user_id)
    user_values: list = [user_id]
    if object_id:
        user_values.extend([object_id, str(object_id)])
    unique_values = []
    for value in user_values:
        if value not in unique_values:
            unique_values.append(value)
    return {
        "tenantId": tenant_id_query(tenant_id),
        "userId": {"$in": unique_values},
    }


def product_id_query(product_id) -> dict:
    object_id = as_object_id(product_id)
    values: list = [product_id]
    if object_id:
        values.extend([object_id, str(object_id)])
    unique_values = []
    for value in values:
        if value not in unique_values:
            unique_values.append(value)
    return {"$in": unique_values}


def find_active_product(product_id, tenant_id: str):
    object_id = as_object_id(product_id)
    if not object_id:
        return None
    product = products.find_one(
        {
            "_id": object_id,
            "isActive": True,
        }
    )
    if not product:
        return None
    if normalize_tenant_id(product.get("tenantId")) != normalize_tenant_id(
        tenant_id
    ):
        return None
    return product



def get_variant(product: dict, variant_id: str | None):
    if not variant_id:
        return None
    for variant in product.get("inventory") or []:
        if not isinstance(variant, dict):
            continue
        if str(variant.get("variantId", "")) == str(variant_id):
            return variant
    return None


def get_variant_image(product: dict, color: str | None):
    images = product.get("images", {})
    if isinstance(images, dict):
        if color and images.get(color):
            color_images = images[color]
            if isinstance(color_images, list) and color_images:
                return color_images[0]
        for color_images in images.values():
            if isinstance(color_images, list) and color_images:
                return color_images[0]
    if isinstance(images, list) and images:
        return images[0]
    return None


def variant_stock(variant: dict | None) -> int:
    if not variant:
        return 0
    try:
        return int(variant.get("stock", 0) or 0)
    except (TypeError, ValueError):
        return 0


def serialize_address(address: dict | None) -> dict | None:
    if not address:
        return None
    data = dict(address)
    data["_id"] = str(data["_id"])
    if data.get("userId") is not None:
        data["userId"] = str(data["userId"])
    return data


def resolve_shipping_address(
    tenant_id: str,
    user_id: str,
    address_id: str | None = None,
    required: bool = False,
) -> dict | None:
    owner_query = cart_owner_query(tenant_id, user_id)
    if address_id:
        object_id = as_object_id(address_id)
        if not object_id:
            raise HTTPException(
                status_code=400,
                detail="Invalid delivery address.",
            )
        address = addresses.find_one(
            {
                "_id": object_id,
                **owner_query,
            }
        )
        if not address:
            raise HTTPException(
                status_code=404,
                detail="Selected delivery address was not found.",
            )
        return serialize_address(address)
    address = addresses.find_one(
        {
            **owner_query,
            "isDefault": True,
        }
    )
    if not address:
        address = addresses.find_one(owner_query)
    if required and not address:
        raise HTTPException(
            status_code=400,
            detail="Please add a delivery address before placing the order.",
        )
    return serialize_address(address)


def calculate_checkout(
    tenant_id: str,
    user_id: str,
    coupon_code: str | None = None,
    address_id: str | None = None,
    require_address: bool = False,
):
    tenant_id = normalize_tenant_id(tenant_id)
    cart_items = list(carts.find(cart_owner_query(tenant_id, user_id)))
    if not cart_items:
        raise HTTPException(
            status_code=404,
            detail="Cart is empty.",
        )
    items = []
    subtotal = 0.0
    for cart_item in cart_items:
        product = find_active_product(
            cart_item.get("productId"),
            tenant_id,
        )
        if not product:
            carts.delete_one({"_id": cart_item["_id"]})
            continue
        variant_id = cart_item.get("variantId")
        variant = get_variant(product, variant_id)
        if not variant:
            carts.delete_one({"_id": cart_item["_id"]})
            continue
        quantity = int(cart_item.get("quantity", 0) or 0)
        stock = variant_stock(variant)
        if quantity <= 0 or stock <= 0:
            carts.delete_one({"_id": cart_item["_id"]})
            continue
        if quantity > stock:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{product['name']} has only "
                    f"{stock} item(s) in stock."
                ),
            )
        price = float(product["finalPrice"])
        line_total = round(price * quantity, 2)
        subtotal += line_total
        color = variant.get("color")
        items.append(
            {
                "productId": str(product["_id"]),
                "variantId": str(variant.get("variantId")),
                "name": product["name"],
                "price": price,
                "quantity": quantity,
                "subtotal": line_total,
                "color": color,
                "size": variant.get("size"),
                "image": get_variant_image(product, color),
            }
        )
    if not items:
        raise HTTPException(
            status_code=400,
            detail=(
                "Your cart products are no longer available. "
                "Please add items again."
            ),
        )
    subtotal = round(subtotal, 2)
    discount = 0.0
    coupon_code_response = None
    if coupon_code and coupon_code.strip():
        normalized_coupon = coupon_code.strip().upper()
        coupon = coupons.find_one(
            {
                "tenantId": tenant_id_query(tenant_id),
                "code": normalized_coupon,
                "isActive": True,
            }
        )
        if not coupon:
            raise HTTPException(
                status_code=404,
                detail="Invalid coupon.",
            )
        now = datetime.utcnow()
        if coupon.get("startDate") and coupon["startDate"] > now:
            raise HTTPException(
                status_code=400,
                detail="Coupon is not active yet.",
            )
        if coupon.get("endDate") and coupon["endDate"] < now:
            raise HTTPException(
                status_code=400,
                detail="Coupon has expired.",
            )
        minimum_order_amount = float(
            coupon.get("minimumOrderAmount", 0) or 0
        )
        if subtotal < minimum_order_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order amount is ₹{minimum_order_amount}",
            )
        usage_limit = coupon.get("usageLimit", 0) or 0
        used_count = coupon.get("usedCount", 0) or 0
        if usage_limit > 0 and used_count >= usage_limit:
            raise HTTPException(
                status_code=400,
                detail="Coupon usage limit exceeded.",
            )
        discount_type = coupon.get("discountType")
        discount_value = float(coupon.get("discountValue", 0) or 0)
        if discount_type == "percentage":
            discount = subtotal * discount_value / 100
            maximum_discount = coupon.get("maximumDiscount")
            if maximum_discount:
                discount = min(discount, float(maximum_discount))
        else:
            discount = min(discount_value, subtotal)
        discount = round(discount, 2)
        coupon_code_response = coupon.get("code")
    shipping = 0.0
    if subtotal < 1000:
        shipping = 100.0
    taxable_amount = max(subtotal - discount, 0)
    tax = round(taxable_amount * 0.18, 2)
    grand_total = round(taxable_amount + shipping + tax, 2)
    if grand_total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid checkout amount.",
        )
    address = resolve_shipping_address(
        tenant_id,
        user_id,
        address_id=address_id,
        required=require_address,
    )
    return {
        "items": items,
        "subtotal": subtotal,
        "couponCode": coupon_code_response,
        "discount": discount,
        "shipping": shipping,
        "tax": tax,
        "grandTotal": grand_total,
        "address": address,
    }
