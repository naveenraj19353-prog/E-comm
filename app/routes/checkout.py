from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.models.checkout import CheckoutRequest
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.checkout_service import calculate_checkout
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(
    prefix="/checkout",
    tags=["Checkout"],
)


@router.post(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def checkout(
    request: CheckoutRequest,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        checkout_data = calculate_checkout(
            tenant_id=tenant_id,
            user_id=user_id,
            coupon_code=request.couponCode,
            address_id=request.addressId,
            delivery_method=request.deliveryMethod,
        )
        return {
            "success": True,
            "message": "Checkout summary generated successfully.",
            "data": checkout_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        print("Checkout error:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to generate checkout summary.",
        )
