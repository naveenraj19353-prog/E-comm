from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.models.checkout import CheckoutRequest
from app.database.mongo import (
    carts,
    products,
    addresses,
    coupons
)

router = APIRouter(
    prefix="/checkout",
    tags=["Checkout"]
)


@router.post("/")
def checkout(request: CheckoutRequest):

    # ----------------------------
    # Get Cart Items
    # ----------------------------
    cart_items = list(carts.find({
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId)
    }))

    if not cart_items:
        raise HTTPException(
            status_code=404,
            detail="Cart is empty."
        )

    items = []
    subtotal = 0

    for item in cart_items:

        product = products.find_one({
            "_id": item["productId"],
            "tenantId": request.tenantId,
            "isActive": True
        })

        if not product:
            continue

        # Check stock
        if item["quantity"] > product["stock"]:
            raise HTTPException(
                status_code=400,
                detail=f"{product['name']} has only {product['stock']} item(s) in stock."
            )

        line_total = product["finalPrice"] * item["quantity"]

        subtotal += line_total

        items.append({
            "productId": str(product["_id"]),
            "name": product["name"],
            "price": product["finalPrice"],
            "quantity": item["quantity"],
            "subtotal": line_total,
            "image": product["images"][0] if product["images"] else None
        })

    # ----------------------------
    # Coupon Validation
    # ----------------------------
    discount = 0
    coupon_code = None

    if request.couponCode:

        coupon = coupons.find_one({
            "tenantId": request.tenantId,
            "code": request.couponCode.upper(),
            "isActive": True
        })

        if not coupon:
            raise HTTPException(
                status_code=404,
                detail="Invalid coupon."
            )

        now = datetime.utcnow()

        if coupon["startDate"] > now:
            raise HTTPException(
                status_code=400,
                detail="Coupon is not active yet."
            )

        if coupon["endDate"] < now:
            raise HTTPException(
                status_code=400,
                detail="Coupon has expired."
            )

        if subtotal < coupon["minimumOrderAmount"]:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order amount is ₹{coupon['minimumOrderAmount']}"
            )

        if (
            coupon["usageLimit"] > 0
            and coupon["usedCount"] >= coupon["usageLimit"]
        ):
            raise HTTPException(
                status_code=400,
                detail="Coupon usage limit exceeded."
            )

        if coupon["discountType"] == "percentage":

            discount = (subtotal * coupon["discountValue"] / 100)

            if coupon.get("maximumDiscount"):
                discount = min(discount, coupon["maximumDiscount"])

        else:
            discount = coupon["discountValue"]

        coupon_code = coupon["code"]

    # ----------------------------
    # Shipping  this can be editable
    # ----------------------------
    shipping = 0

    if subtotal < 1000:
        shipping = 100

    # ----------------------------
    # Tax (18%)
    # ----------------------------
    taxable_amount = subtotal - discount

    tax = round(taxable_amount * 0.18, 2)

    # ----------------------------
    # Grand Total
    # ----------------------------
    grand_total = round(taxable_amount + shipping + tax,2)

    # ----------------------------
    # Default Address
    # ----------------------------
    address = addresses.find_one({
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId),
        "isDefault": True
    })

    if address:
        address["_id"] = str(address["_id"])
        address["userId"] = str(address["userId"])

    # ----------------------------
    # Response
    # ----------------------------
    return {
        "success": True,
        "message": "Checkout summary generated successfully.",
        "data": {
            "items": items,
            "subtotal": subtotal,
            "couponCode": coupon_code,
            "discount": discount,
            "shipping": shipping,
            "tax": tax,
            "grandTotal": grand_total,
            "address": address
        }
    }