from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.mongo import coupons
from app.models.coupon import ApplyCoupon, CreateCoupon, UpdateCoupon
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.checkout_service import as_object_id, tenant_id_query
from app.services.coupon_service import (
    build_coupon_document,
    load_valid_coupon,
    serialize_coupon,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_admin,
    require_customer,
)

router = APIRouter(prefix="/coupon", tags=["Coupon"])


@router.get(
    "/list",
    responses={403: FORBIDDEN_RESPONSE[403]},
)
def list_coupons(
    current_user: Annotated[dict, Depends(require_admin)],
    tenantId: Annotated[str | None, Query()] = None,
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    rows = list(
        coupons.find({"tenantId": tenant_id_query(tenant_id)}).sort("createdAt", -1)
    )
    return {
        "success": True,
        "data": [serialize_coupon(row) for row in rows],
    }


@router.post(
    "/create-coupon",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        409: CONFLICT_RESPONSE[409],
    },
)
def create_coupon(
    request: CreateCoupon,
    current_user: Annotated[dict, Depends(require_admin)],
):
    tenant_id = admin_tenant_id(current_user, request.tenantId)
    existing = coupons.find_one(
        {"tenantId": tenant_id_query(tenant_id), "code": request.code.upper()}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Coupon already exists.")
    now = datetime.now(timezone.utc)
    document = build_coupon_document(tenant_id, request.model_dump())
    document["usedCount"] = 0
    document["createdAt"] = now
    document["updatedAt"] = now
    result = coupons.insert_one(document)
    return {
        "success": True,
        "couponId": str(result.inserted_id),
        "message": "Coupon created successfully.",
    }


@router.put(
    "/{coupon_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_coupon(
    coupon_id: str,
    request: UpdateCoupon,
    current_user: Annotated[dict, Depends(require_admin)],
):
    object_id = as_object_id(coupon_id)
    if not object_id:
        raise HTTPException(status_code=400, detail="Invalid coupon.")
    existing = coupons.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    tenant_id = admin_tenant_id(
        current_user,
        request.tenantId or existing.get("tenantId"),
    )
    if str(existing.get("tenantId") or "").strip().lower() != tenant_id:
        raise HTTPException(status_code=403, detail="You cannot access another tenant.")
    merged = dict(existing)
    merged.update(request.model_dump(exclude_unset=True))
    merged["code"] = existing.get("code")
    document = build_coupon_document(tenant_id, merged, existing=existing)
    document["usedCount"] = existing.get("usedCount", 0) or 0
    document["createdAt"] = existing.get("createdAt")
    document["updatedAt"] = datetime.now(timezone.utc)
    coupons.update_one({"_id": object_id}, {"$set": document})
    updated = coupons.find_one({"_id": object_id})
    return {
        "success": True,
        "message": "Coupon updated.",
        "data": serialize_coupon(updated or document),
    }


@router.post(
    "/apply-coupon",
    responses={
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def apply_coupon(
    request: ApplyCoupon,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, _user_id = customer_scope(current_user)
    coupon = load_valid_coupon(tenant_id, request.couponCode.upper())
    serialized = serialize_coupon(coupon)
    return {
        "success": True,
        "coupon": {
            "code": serialized.get("code"),
            "description": serialized.get("description"),
            "discountType": serialized.get("discountType"),
            "discountValue": serialized.get("discountValue"),
            "minimumOrderAmount": serialized.get("minimumOrderAmount"),
            "maximumDiscount": serialized.get("maximumDiscount"),
            "offerType": serialized.get("offerType"),
            "festivalMessage": serialized.get("festivalMessage"),
        },
    }
