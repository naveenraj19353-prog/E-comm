from fastapi import APIRouter, Depends, HTTPException
from app.models.checkout import CheckoutRequest
from app.services.checkout_service import calculate_checkout
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(
    prefix="/checkout",
    tags=["Checkout"],
)


@router.post("/")
def checkout(
    request: CheckoutRequest,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        checkout_data = calculate_checkout(
            tenant_id=tenant_id,
            user_id=user_id,
            coupon_code=request.couponCode,
            address_id=request.addressId,
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
