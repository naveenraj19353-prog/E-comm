from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pymongo import DESCENDING

from app.database.mongo import orders, users
from app.models.checkout import CreateCodOrder
from app.models.orders import UpdateOrderStatus
from app.routes.detail_messages import ORDER_NOT_FOUND
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    GONE_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.order_fulfillment import fulfill_cod_order, restore_variant_stock
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_admin,
    require_customer,
)

router = APIRouter(prefix="/orders", tags=["Orders"])

ADMIN_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "confirmed": {"processing", "shipped", "cancelled"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}


@router.post("/", responses={410: GONE_RESPONSE[410]})
def create_order(current_user: Annotated[dict, Depends(require_customer)]):
    raise HTTPException(
        status_code=410,
        detail="Orders are created only after payment verification.",
    )


@router.post(
    "/cod",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        409: CONFLICT_RESPONSE[409],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def create_cod_order(
    request: CreateCodOrder,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        return fulfill_cod_order(
            tenant_id=tenant_id,
            user_id=user_id,
            address_id=request.addressId,
            coupon_code=request.couponCode,
            delivery_method=request.deliveryMethod,
        )
    except HTTPException:
        raise
    except Exception as error:
        print("COD order error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to place COD order.")


@router.get(
    "/admin/list",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def list_tenant_orders(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    try:
        cursor = orders.find({"tenantId": scoped_tenant_id}).sort(
            "createdAt", DESCENDING
        )
        data = []
        user_cache: dict[str, dict] = {}
        for order in cursor:
            user_key = str(order.get("userId", ""))
            if user_key and user_key not in user_cache:
                user = users.find_one({"_id": ObjectId(user_key)})
                user_cache[user_key] = {
                    "name": user.get("name") if user else "Customer",
                    "email": user.get("email") if user else "",
                }
            data.append(
                _serialize_order(
                    order,
                    customer=user_cache.get(user_key),
                )
            )
        return {"success": True, "count": len(data), "data": data}
    except Exception as error:
        print("List tenant orders error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to fetch orders.")


@router.patch(
    "/admin/{order_id}/status",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_order_status(
    order_id: str,
    payload: UpdateOrderStatus,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order ID.")

    order = orders.find_one({"_id": object_id, "tenantId": scoped_tenant_id})
    if not order:
        raise HTTPException(status_code=404, detail=ORDER_NOT_FOUND)

    current_status = order.get("orderStatus", "confirmed")
    next_status = payload.orderStatus
    if next_status == current_status:
        return {
            "success": True,
            "message": "Order status unchanged.",
            "order": _serialize_order(order),
        }

    allowed = ADMIN_STATUS_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order status from {current_status} to {next_status}.",
        )

    now = datetime.now(timezone.utc)
    if next_status == "cancelled" and current_status != "cancelled":
        for item in order.get("items") or []:
            variant_id = item.get("variantId")
            if not variant_id:
                continue
            restore_variant_stock(
                item["productId"],
                str(variant_id),
                int(item.get("quantity", 0)),
                now,
            )

    orders.update_one(
        {"_id": object_id},
        {
            "$set": {
                "orderStatus": next_status,
                "updatedAt": now,
            }
        },
    )
    updated = orders.find_one({"_id": object_id})
    return {
        "success": True,
        "message": f"Order marked as {next_status}.",
        "order": _serialize_order(updated),
    }


@router.get(
    "/admin/detail/{order_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_admin_order_detail(
    order_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order ID.")

    order = orders.find_one({"_id": object_id, "tenantId": scoped_tenant_id})
    if not order:
        raise HTTPException(status_code=404, detail=ORDER_NOT_FOUND)

    user_key = str(order.get("userId", ""))
    customer = None
    if user_key:
        user = users.find_one({"_id": ObjectId(user_key)})
        if user:
            customer = {
                "name": user.get("name"),
                "email": user.get("email"),
            }

    return {
        "success": True,
        "order": _serialize_order(order, customer=customer),
    }


@router.get(
    "/detail/{order_id}",
    responses={
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def get_order(
    order_id: str,
    current_user: Annotated[dict, Depends(require_customer)],
    _tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    _user_id: Annotated[str | None, Query(alias="userId")] = None,
):
    scoped_tenant_id, token_user_id = customer_scope(current_user)
    try:
        order = orders.find_one(
            {
                "_id": ObjectId(order_id),
                "tenantId": scoped_tenant_id,
                "userId": ObjectId(token_user_id),
            }
        )
        if not order:
            raise HTTPException(status_code=404, detail=ORDER_NOT_FOUND)
        return {"success": True, "order": _serialize_order(order)}
    except HTTPException:
        raise
    except Exception as error:
        print("Get order error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to fetch order.")


@router.get(
    "/{userId}",
    responses={
        403: FORBIDDEN_RESPONSE[403],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def get_user_orders(
    user_id: Annotated[str, Path(alias="userId")],
    current_user: Annotated[dict, Depends(require_customer)],
    _tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id, token_user_id = customer_scope(current_user)
    if user_id != token_user_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another user's orders.",
        )
    try:
        cursor = orders.find(
            {"tenantId": scoped_tenant_id, "userId": ObjectId(token_user_id)}
        ).sort("createdAt", DESCENDING)
        data = [_serialize_order(order) for order in cursor]
        return {"success": True, "count": len(data), "data": data}
    except Exception as error:
        print("Get orders error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to fetch orders.")


def _serialize_address(address: dict | None) -> dict | None:
    if not address:
        return None
    return {
        "fullName": address.get("fullName"),
        "phone": address.get("phone"),
        "addressLine1": address.get("addressLine1"),
        "addressLine2": address.get("addressLine2"),
        "city": address.get("city"),
        "state": address.get("state"),
        "postalCode": address.get("postalCode"),
        "country": address.get("country"),
    }


def _serialize_order(order: dict, customer: dict | None = None) -> dict:
    address = order.get("address")
    if isinstance(address, dict):
        address_payload = _serialize_address(address)
        address_id = None
    else:
        address_payload = None
        address_id = str(order["addressId"]) if order.get("addressId") else None

    payload = {
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
                "image": item.get("image"),
                "color": item.get("color"),
                "size": item.get("size"),
            }
            for item in order.get("items", [])
        ],
        "subtotal": order.get("subtotal", 0),
        "discount": order.get("discount", 0),
        "shipping": order.get("shipping", 0),
        "totalAmount": order.get("totalAmount", 0),
        "paymentStatus": order.get("paymentStatus"),
        "orderStatus": order.get("orderStatus"),
        "address": address_payload,
        "addressId": address_id,
        "createdAt": order.get("createdAt"),
        "updatedAt": order.get("updatedAt"),
    }
    if customer:
        payload["customer"] = customer
    return payload
