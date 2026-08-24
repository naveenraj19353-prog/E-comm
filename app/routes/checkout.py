from fastapi import APIRouter, HTTPException
from app.models.checkout import CheckoutRequest
from app.services.checkout_service import calculate_checkout
router = APIRouter(
    prefix="/checkout",
    tags=["Checkout"],
)
# ============================================================
# CHECKOUT SUMMARY
# ============================================================
@router.post("/")
def checkout(request: CheckoutRequest):
    try:
        checkout_data = calculate_checkout(
            tenant_id=request.tenantId,
            user_id=request.userId,
            coupon_code=request.couponCode,
        )
        return {
            "success": True,
            "message": ("Checkout summary generated successfully."),
            "data": checkout_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "Checkout error:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to generate checkout summary.",
        )
