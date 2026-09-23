from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query
from pymongo import DESCENDING

from app.database.mongo import orders, shipments, users
from app.models.checkout import CreateCodOrder
from app.models.menu import PlaceMenuOrderRequest
from app.models.orders import RejectReturn, RequestReturn, UpdateOrderStatus
from app.routes.detail_messages import ORDER_NOT_FOUND
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    GONE_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.menu_service import fulfill_menu_order, normalize_counter_number
from app.services.order_fulfillment import fulfill_cod_order, restore_variant_stock
from app.services.return_service import (
    approve_return,
    can_customer_request_return,
    issue_refund,
    mark_return_received,
    reject_return,
    request_return,
    serialize_return,
)
from app.services.whatsapp_notification_service import (
    send_order_confirmation,
    send_order_status_update,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_customer,
    require_permission,
)

router = APIRouter(prefix="/orders", tags=["Orders"])

ADMIN_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "confirmed": {"processing", "shipped", "cancelled"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
    "open": {"closed", "cancelled"},
    "closed": set(),
    "return_requested": set(),
    "return_approved": set(),
    "returned": set(),
    "refunded": set(),
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
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    try:
        result = fulfill_cod_order(
            tenant_id=tenant_id,
            user_id=user_id,
            address_id=request.addressId,
            coupon_code=request.couponCode,
            delivery_method=request.deliveryMethod,
        )
        send_order_confirmation(background_tasks, result["orderId"])
        return result
    except HTTPException:
        raise
    except Exception as error:
        print("COD order error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to place COD order.")


@router.post(
    "/menu",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        409: CONFLICT_RESPONSE[409],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def create_menu_order(
    current_user: Annotated[dict, Depends(require_customer)],
    request: PlaceMenuOrderRequest = PlaceMenuOrderRequest(),
):
    tenant_id, user_id = customer_scope(current_user)
    counter_number = (
        request.counterNumber
        or current_user.get("counterNumber")
        or ""
    )
    phone = current_user.get("phone") or ""
    if not counter_number:
        raise HTTPException(
            status_code=400,
            detail="Table / room number is required. Please sign in again.",
        )
    if not phone:
        raise HTTPException(
            status_code=400,
            detail="Mobile number missing from session. Please sign in again.",
        )
    try:
        result = fulfill_menu_order(
            tenant_id=tenant_id,
            user_id=user_id,
            counter_number=normalize_counter_number(str(counter_number)),
            phone=str(phone),
        )
        send_order_confirmation(background_tasks, result["orderId"])
        return result
    except HTTPException:
        raise
    except Exception as error:
        print("Menu order error:", str(error))
        raise HTTPException(status_code=500, detail="Unable to place menu order.")


@router.get(
    "/admin/list",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def list_tenant_orders(
    current_user: Annotated[dict, Depends(require_permission("orders"))],
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
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
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

    status_fields = {
        "orderStatus": next_status,
        "updatedAt": now,
    }
    if next_status == "delivered":
        status_fields["deliveredAt"] = now

    orders.update_one(
        {"_id": object_id},
        {"$set": status_fields},
    )
    updated = orders.find_one({"_id": object_id})
    send_order_status_update(background_tasks, order_id, next_status)
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
    current_user: Annotated[dict, Depends(require_permission("orders"))],
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


@router.post(
    "/admin/{order_id}/return/approve",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def admin_approve_return(
    order_id: str,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    order = approve_return(order_id=order_id, tenant_id=scoped_tenant_id)
    return {"success": True, "order": _serialize_order(order)}


@router.post(
    "/admin/{order_id}/return/reject",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def admin_reject_return(
    order_id: str,
    payload: RejectReturn,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    order = reject_return(
        order_id=order_id,
        tenant_id=scoped_tenant_id,
        reason=payload.reason,
    )
    return {"success": True, "order": _serialize_order(order)}


@router.post(
    "/admin/{order_id}/return/received",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def admin_mark_return_received(
    order_id: str,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    order = mark_return_received(order_id=order_id, tenant_id=scoped_tenant_id)
    return {"success": True, "order": _serialize_order(order)}


@router.post(
    "/admin/{order_id}/return/refund",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def admin_issue_refund(
    order_id: str,
    current_user: Annotated[dict, Depends(require_permission("orders"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    order = issue_refund(order_id=order_id, tenant_id=scoped_tenant_id)
    return {"success": True, "order": _serialize_order(order)}


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


@router.post(
    "/detail/{order_id}/return",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def customer_request_return(
    order_id: str,
    payload: RequestReturn,
    current_user: Annotated[dict, Depends(require_customer)],
):
    scoped_tenant_id, token_user_id = customer_scope(current_user)
    order = request_return(
        order_id=order_id,
        tenant_id=scoped_tenant_id,
        user_id=token_user_id,
        reason=payload.reason,
    )
    return {"success": True, "order": _serialize_order(order)}


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
        "deliveredAt": order.get("deliveredAt"),
        "returnRequest": serialize_return(order),
        "canRequestReturn": can_customer_request_return(order),
        "address": address_payload,
        "addressId": address_id,
        "paymentMethod": order.get("paymentMethod"),
        "deliveryMethod": order.get("deliveryMethod"),
        "channel": order.get("channel"),
        "counterNumber": order.get("counterNumber"),
        "phone": order.get("phone"),
        "paidAt": order.get("paidAt"),
        "courier": _resolve_courier(order),
        "createdAt": order.get("createdAt"),
        "updatedAt": order.get("updatedAt"),
    }
    if customer:
        payload["customer"] = customer
    return payload


DELHIVERY_TRACK_URL = "https://www.delhivery.com/track-v2/package/{waybill}"


def _resolve_courier(order: dict) -> dict | None:
    courier = order.get("courier") if isinstance(order.get("courier"), dict) else {}
    waybill = str(courier.get("waybill") or "").strip()
    if not waybill:
        shipment = shipments.find_one(
            {
                "tenantId": order.get("tenantId"),
                "orderId": str(order.get("_id")),
            }
        )
        if shipment and shipment.get("awb"):
            waybill = str(shipment.get("awb") or "").strip()
            courier = {
                "provider": shipment.get("provider") or "delhivery",
                "waybill": waybill,
                "trackingUrl": shipment.get("trackingUrl"),
                "labelUrl": shipment.get("labelUrl"),
                "pickupLocation": shipment.get("pickupLocation"),
                "shippedAt": shipment.get("createdAt"),
                "trackingStatus": shipment.get("trackingStatus"),
            }
    return _serialize_courier(courier)


def _serialize_courier(courier) -> dict | None:
    if not isinstance(courier, dict):
        return None
    waybill = str(courier.get("waybill") or "").strip()
    if not waybill:
        return None
    tracking_url = str(courier.get("trackingUrl") or "").strip()
    if not tracking_url or "/api/" in tracking_url:
        tracking_url = DELHIVERY_TRACK_URL.format(waybill=waybill)
    label_url = str(courier.get("labelUrl") or "").strip()
    if "/api/" in label_url:
        label_url = ""
    return {
        "provider": courier.get("provider") or "delhivery",
        "waybill": waybill,
        "trackingUrl": tracking_url,
        "labelUrl": label_url or None,
        "pickupLocation": courier.get("pickupLocation"),
        "shippedAt": courier.get("shippedAt"),
        "trackingStatus": courier.get("trackingStatus"),
    }
