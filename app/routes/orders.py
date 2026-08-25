from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from app.database.mongo import orders
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("/")
def create_order(current_user: dict = Depends(require_customer)):
    raise HTTPException(
        status_code=410,
        detail="Orders are created only after payment verification.",
    )


@router.get("/detail/{order_id}")
def get_order(
    order_id: str,
    tenantId: str | None = None,
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    try:
        order = orders.find_one(
            {
                "_id": ObjectId(order_id),
                "tenantId": tenant_id,
                "userId": ObjectId(token_user_id),
            }
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found.")
        return {"success": True, "order": _serialize_order(order)}
    except HTTPException:
        raise
    except Exception as e:
        print("Get order error:", str(e))
        raise HTTPException(status_code=500, detail="Unable to fetch order.")


@router.get("/{userId}")
def get_user_orders(
    userId: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if userId != token_user_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another user's orders.",
        )
    try:
        cursor = orders.find(
            {"tenantId": tenant_id, "userId": ObjectId(token_user_id)}
        ).sort("createdAt", -1)
        data = []
        for order in cursor:
            data.append(_serialize_order(order))
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        print("Get orders error:", str(e))
        raise HTTPException(status_code=500, detail="Unable to fetch orders.")


def _serialize_order(order: dict) -> dict:
    return {
        "orderId": str(order["_id"]),
        "razorpayOrderId": order.get("razorpayOrderId"),
        "razorpayPaymentId": order.get("razorpayPaymentId"),
        "items": [
            {
                "productId": str(item["productId"]),
                "variantId": item.get("variantId"),
                "name": item["name"],
                "price": item["price"],
                "quantity": item["quantity"],
                "subtotal": item["subtotal"],
            }
            for item in order.get("items", [])
        ],
        "subtotal": order.get("subtotal", 0),
        "totalAmount": order.get("totalAmount", 0),
        "paymentStatus": order.get("paymentStatus"),
        "orderStatus": order.get("orderStatus"),
        "addressId": str(order["addressId"]) if order.get("addressId") else None,
        "createdAt": order.get("createdAt"),
        "updatedAt": order.get("updatedAt"),
    }
