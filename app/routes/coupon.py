from app.models.coupon import ApplyCoupon, CreateCoupon
from fastapi import APIRouter, HTTPException
from app.database.mongo import carts, products, addresses, coupons
from datetime import datetime

router = APIRouter(prefix="/coupon", tags=["Coupon"])


@router.post("/create-coupon")
def create_coupon(request: CreateCoupon):

    existing = coupons.find_one(
        {"tenantId": request.tenantId, "code": request.code.upper()}
    )

    if existing:
        raise HTTPException(status_code=409, detail="Coupon already exists.")

    if request.endDate <= request.startDate:
        raise HTTPException(
            status_code=400, detail="End date must be after start date."
        )

    coupon = {
        "tenantId": request.tenantId,
        "code": request.code.upper(),
        "description": request.description,
        "discountType": request.discountType,
        "discountValue": request.discountValue,
        "minimumOrderAmount": request.minimumOrderAmount,
        "maximumDiscount": request.maximumDiscount,
        "usageLimit": request.usageLimit,
        "usedCount": 0,
        "startDate": request.startDate,
        "endDate": request.endDate,
        "isActive": True,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }

    result = coupons.insert_one(coupon)

    return {
        "success": True,
        "couponId": str(result.inserted_id),
        "message": "Coupon created successfully.",
    }


@router.post("/apply-coupon")
def apply_coupon(request: ApplyCoupon):

    coupon = coupons.find_one(
        {
            "tenantId": request.tenantId,
            "code": request.couponCode.upper(),
            "isActive": True,
        }
    )

    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon.")

    return {"success": True, "coupon": coupon}
