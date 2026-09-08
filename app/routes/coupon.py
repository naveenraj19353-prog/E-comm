from app.models.coupon import ApplyCoupon, CreateCoupon
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import coupons
from datetime import datetime, timezone
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_admin,
    require_customer,
)

router = APIRouter(prefix="/coupon", tags=["Coupon"])


@router.post(
    "/create-coupon",
    responses={
        **BAD_REQUEST_RESPONSE,
        **FORBIDDEN_RESPONSE,
        **CONFLICT_RESPONSE,
    },
)
def create_coupon(
    request: CreateCoupon,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, request.tenantId)
    existing = coupons.find_one(
        {"tenantId": tenant_id, "code": request.code.upper()}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Coupon already exists.")
    if request.endDate <= request.startDate:
        raise HTTPException(
            status_code=400, detail="End date must be after start date."
        )
    coupon = {
        "tenantId": tenant_id,
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
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    result = coupons.insert_one(coupon)
    return {
        "success": True,
        "couponId": str(result.inserted_id),
        "message": "Coupon created successfully.",
    }


@router.post(
    "/apply-coupon",
    responses={**FORBIDDEN_RESPONSE, **NOT_FOUND_RESPONSE},
)
def apply_coupon(
    request: ApplyCoupon,
    current_user: dict = Depends(require_customer),
):
    tenant_id, _user_id = customer_scope(current_user)
    coupon = coupons.find_one(
        {
            "tenantId": tenant_id,
            "code": request.couponCode.upper(),
            "isActive": True,
        }
    )
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon.")
    return {
        "success": True,
        "coupon": {
            "code": coupon.get("code"),
            "description": coupon.get("description"),
            "discountType": coupon.get("discountType"),
            "discountValue": coupon.get("discountValue"),
            "minimumOrderAmount": coupon.get("minimumOrderAmount"),
            "maximumDiscount": coupon.get("maximumDiscount"),
        },
    }
