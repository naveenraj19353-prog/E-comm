from fastapi import HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import (
    carts,
    products,
    addresses,
    coupons,
)


def calculate_checkout(
    tenant_id: str,
    user_id: str,
    coupon_code: str | None = None,
):
    """
    Calculate the complete checkout amount from
    the current database state.

    subtotal
    - discount
    + shipping
    + tax
    = grand total
    """

    # ========================================================
    # GET CART
    # ========================================================

    cart_items = list(
        carts.find({
            "tenantId": tenant_id,
            "userId": ObjectId(user_id),
        })
    )

    if not cart_items:
        raise HTTPException(
            status_code=404,
            detail="Cart is empty.",
        )

    items = []
    subtotal = 0.0

    # ========================================================
    # GET PRODUCTS + CHECK STOCK
    # ========================================================

    for cart_item in cart_items:

        product = products.find_one({
            "_id": cart_item["productId"],
            "tenantId": tenant_id,
            "isActive": True,
        })

        if not product:
            raise HTTPException(
                status_code=404,
                detail="One or more products are no longer available.",
            )

        quantity = cart_item["quantity"]

        stock = product.get("stock", 0)

        if quantity > stock:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{product['name']} has only "
                    f"{stock} item(s) in stock."
                ),
            )

        price = float(
            product["finalPrice"]
        )

        line_total = round(
            price * quantity,
            2,
        )

        subtotal += line_total

        items.append({
            "productId": str(product["_id"]),
            "name": product["name"],
            "price": price,
            "quantity": quantity,
            "subtotal": line_total,
            "image": (
                product["images"][0]
                if product.get("images")
                else None
            ),
        })

    subtotal = round(subtotal, 2)

    # ========================================================
    # COUPON
    # ========================================================

    discount = 0.0
    coupon = None
    coupon_code_response = None

    if coupon_code and coupon_code.strip():

        normalized_coupon = (
            coupon_code.strip().upper()
        )

        coupon = coupons.find_one({
            "tenantId": tenant_id,
            "code": normalized_coupon,
            "isActive": True,
        })

        if not coupon:
            raise HTTPException(
                status_code=404,
                detail="Invalid coupon.",
            )

        now = datetime.utcnow()

        # ----------------------------------------------------
        # Start date
        # ----------------------------------------------------

        if coupon.get("startDate") and (
            coupon["startDate"] > now
        ):
            raise HTTPException(
                status_code=400,
                detail="Coupon is not active yet.",
            )

        # ----------------------------------------------------
        # End date
        # ----------------------------------------------------

        if coupon.get("endDate") and (
            coupon["endDate"] < now
        ):
            raise HTTPException(
                status_code=400,
                detail="Coupon has expired.",
            )

        # ----------------------------------------------------
        # Minimum order amount
        # ----------------------------------------------------

        minimum_order_amount = float(
            coupon.get(
                "minimumOrderAmount",
                0,
            )
        )

        if subtotal < minimum_order_amount:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Minimum order amount is "
                    f"₹{minimum_order_amount}"
                ),
            )

        # ----------------------------------------------------
        # Usage limit
        # ----------------------------------------------------

        usage_limit = coupon.get(
            "usageLimit",
            0,
        )

        used_count = coupon.get(
            "usedCount",
            0,
        )

        if (
            usage_limit > 0
            and used_count >= usage_limit
        ):
            raise HTTPException(
                status_code=400,
                detail="Coupon usage limit exceeded.",
            )

        # ----------------------------------------------------
        # Calculate discount
        # ----------------------------------------------------

        discount_type = coupon.get(
            "discountType"
        )

        discount_value = float(
            coupon.get(
                "discountValue",
                0,
            )
        )

        if discount_type == "percentage":

            discount = (
                subtotal
                * discount_value
                / 100
            )

            maximum_discount = coupon.get(
                "maximumDiscount"
            )

            if maximum_discount:
                discount = min(
                    discount,
                    float(maximum_discount),
                )

        else:

            discount = discount_value

            # Don't allow discount to exceed subtotal
            discount = min(
                discount,
                subtotal,
            )

        discount = round(
            discount,
            2,
        )

        coupon_code_response = coupon.get(
            "code"
        )

    # ========================================================
    # SHIPPING
    # ========================================================

    shipping = 0.0

    if subtotal < 1000:
        shipping = 100.0

    # ========================================================
    # TAX
    # ========================================================

    taxable_amount = max(
        subtotal - discount,
        0,
    )

    tax = round(
        taxable_amount * 0.18,
        2,
    )

    # ========================================================
    # GRAND TOTAL
    # ========================================================

    grand_total = round(
        taxable_amount
        + shipping
        + tax,
        2,
    )

    if grand_total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid checkout amount.",
        )

    # ========================================================
    # DEFAULT ADDRESS
    # ========================================================

    address = addresses.find_one({
        "tenantId": tenant_id,
        "userId": ObjectId(user_id),
        "isDefault": True,
    })

    if address:

        address["_id"] = str(
            address["_id"]
        )

        address["userId"] = str(
            address["userId"]
        )

    # ========================================================
    # RETURN CHECKOUT DATA
    # ========================================================

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