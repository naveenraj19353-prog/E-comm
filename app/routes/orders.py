from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database.mongo import orders, products, carts
from app.models.orders import CreateOrder
router = APIRouter(prefix="/orders", tags=["Orders"])
# ============================================================
# CREATE ORDER
# ============================================================
@router.post("/")
def create_order(request: CreateOrder):
    try:
        # ----------------------------------------------------
        # Check if Razorpay order already exists
        # ----------------------------------------------------
        existing_order = orders.find_one(
            {"tenantId": request.tenantId, "razorpayOrderId": request.razorpayOrderId}
        )
        if existing_order:
            return {
                "success": True,
                "message": "Order already exists.",
                "orderId": str(existing_order["_id"]),
            }
        # ----------------------------------------------------
        # Create order document
        # ----------------------------------------------------
        order_document = {
            "tenantId": request.tenantId,
            "userId": ObjectId(request.userId),
            "razorpayOrderId": request.razorpayOrderId,
            "razorpayPaymentId": request.razorpayPaymentId,
            "items": [
                {
                    "productId": ObjectId(item.productId),
                    "name": item.name,
                    "price": item.price,
                    "quantity": item.quantity,
                    "subtotal": item.subtotal,
                }
                for item in request.items
            ],
            "subtotal": request.subtotal,
            "totalAmount": request.totalAmount,
            "addressId": (ObjectId(request.addressId) if request.addressId else None),
            "paymentStatus": request.paymentStatus,
            "orderStatus": request.orderStatus,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        result = orders.insert_one(order_document)
        return {
            "success": True,
            "message": "Order created successfully.",
            "orderId": str(result.inserted_id),
        }
    except Exception as e:
        print("Create order error:", str(e))
        raise HTTPException(status_code=500, detail="Unable to create order.")
# ============================================================
# GET USER ORDERS
# ============================================================
@router.get("/{userId}")
def get_user_orders(userId: str, tenantId: str):
    try:
        cursor = orders.find({"tenantId": tenantId, "userId": ObjectId(userId)}).sort(
            "createdAt", -1
        )
        data = []
        for order in cursor:
            data.append(
                {
                    "orderId": str(order["_id"]),
                    "razorpayOrderId": order.get("razorpayOrderId"),
                    "razorpayPaymentId": order.get("razorpayPaymentId"),
                    "items": [
                        {
                            "productId": str(item["productId"]),
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
                    "addressId": (
                        str(order["addressId"]) if order.get("addressId") else None
                    ),
                    "createdAt": order.get("createdAt"),
                    "updatedAt": order.get("updatedAt"),
                }
            )
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        print("Get orders error:", str(e))
        raise HTTPException(status_code=500, detail="Unable to fetch orders.")
# ============================================================
# GET SINGLE ORDER
# ============================================================
@router.get("/detail/{order_id}")
def get_order(order_id: str, tenantId: str, userId: str):
    try:
        order = orders.find_one(
            {
                "_id": ObjectId(order_id),
                "tenantId": tenantId,
                "userId": ObjectId(userId),
            }
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found.")
        return {
            "success": True,
            "order": {
                "orderId": str(order["_id"]),
                "razorpayOrderId": order.get("razorpayOrderId"),
                "razorpayPaymentId": order.get("razorpayPaymentId"),
                "items": [
                    {
                        "productId": str(item["productId"]),
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
                "addressId": (
                    str(order["addressId"]) if order.get("addressId") else None
                ),
                "createdAt": order.get("createdAt"),
                "updatedAt": order.get("updatedAt"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print("Get order error:", str(e))
        raise HTTPException(status_code=500, detail="Unable to fetch order.")
