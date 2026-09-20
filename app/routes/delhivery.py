"""Tenant-scoped Delhivery shipping routes."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import PyMongoError

from app.database.mongo import (
    orders,
    shipping_integrations,
    shipping_locations,
    shipments,
    tenants,
)
from app.models.delhivery import (
    CreateDelhiveryShipmentRequest,
    DelhiveryConnectRequest,
    DelhiveryPickupRequest,
    DelhiveryRateRequest,
    DelhiveryTestRequest,
    DelhiveryWarehouseRequest,
)
from app.services.checkout_service import tenant_id_query
from app.services.delhivery_service import (
    PROVIDER,
    DelhiveryError,
    DelhiveryService,
)
from app.services.shipping_adapter import ConfigPartnerService
from app.services.shipping_context import (
    get_active_delhivery_context,
    get_active_shipping_context,
)
from app.services.shipping_partner_config import partner_display_name
from app.services.whatsapp_notification_service import send_shipment_created
from app.utils.auth_dependencies import admin_tenant_id, require_admin
from app.utils.secret_crypto import encrypt_secret, mask_secret, decrypt_secret
from bson import ObjectId

router = APIRouter(prefix="/shipping/delhivery", tags=["Delhivery Shipping"])
logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _provider_error(error: DelhiveryError) -> HTTPException:
    status = error.status_code or 400
    if status < 400 or status > 599:
        status = 400
    return HTTPException(
        status_code=status if status != 401 else 400,
        detail={
            "success": False,
            "provider": PROVIDER,
            "code": error.code,
            "message": str(error),
        },
    )


def _public_integration(doc: dict | None, *, include_pickup: dict | None = None) -> dict:
    if not doc:
        return {
            "provider": PROVIDER,
            "enabled": False,
            "connected": False,
            "hasApiToken": False,
            "apiTokenMasked": "",
            "pickupLocationName": "",
            "pickupLocation": include_pickup,
            "baseUrlConfigured": True,
        }

    masked = ""
    has_token = bool(doc.get("apiTokenEncrypted"))
    if has_token:
        try:
            masked = mask_secret(decrypt_secret(str(doc["apiTokenEncrypted"])))
        except ValueError:
            masked = "••••••••"
            has_token = True

    return {
        "provider": PROVIDER,
        "enabled": bool(doc.get("enabled")),
        "connected": has_token,
        "hasApiToken": has_token,
        "apiTokenMasked": masked,
        "pickupLocationName": doc.get("pickupLocationName") or "",
        "pickupLocation": include_pickup,
        "updatedAt": doc.get("updatedAt"),
        "createdAt": doc.get("createdAt"),
    }


def _active_location(tenant_id: str) -> dict | None:
    loc = shipping_locations.find_one(
        {"tenantId": tenant_id, "provider": PROVIDER, "active": True}
    )
    if not loc:
        return None
    return {
        "name": loc.get("name"),
        "city": loc.get("city"),
        "state": loc.get("state"),
        "pincode": loc.get("pincode"),
        "phone": loc.get("phone"),
        "email": loc.get("email"),
        "address": loc.get("address"),
        "active": bool(loc.get("active")),
    }


@router.get("/settings")
def get_delhivery_settings(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    doc = shipping_integrations.find_one({"tenantId": scoped, "provider": PROVIDER})
    return {
        "success": True,
        "data": _public_integration(doc, include_pickup=_active_location(scoped)),
    }


@router.put("/settings")
def save_delhivery_settings(
    body: DelhiveryConnectRequest,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    existing = shipping_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER}
    )

    token_plain = (body.apiToken or "").strip()
    encrypted = None
    if token_plain:
        encrypted = encrypt_secret(token_plain)
    elif existing and existing.get("apiTokenEncrypted"):
        encrypted = existing["apiTokenEncrypted"]
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "provider": PROVIDER,
                "code": "TOKEN_REQUIRED",
                "message": "Provide a Delhivery API token to connect.",
            },
        )

    pickup_name = (body.pickupLocationName or "").strip()
    if not pickup_name and existing:
        pickup_name = str(existing.get("pickupLocationName") or "")

    now = _now()
    payload = {
        "tenantId": scoped,
        "provider": PROVIDER,
        "enabled": bool(body.enabled),
        "apiTokenEncrypted": encrypted,
        "pickupLocationName": pickup_name,
        "updatedAt": now,
    }
    if not existing:
        payload["createdAt"] = now

    try:
        shipping_integrations.update_one(
            {"tenantId": scoped, "provider": PROVIDER},
            {"$set": payload},
            upsert=True,
        )
    except PyMongoError as error:
        logger.exception("[DELHIVERY] tenant=%s operation=save_settings status=db_error", scoped)
        raise HTTPException(status_code=500, detail="Failed to save Delhivery settings.") from error

    # Never return plaintext token
    saved = shipping_integrations.find_one({"tenantId": scoped, "provider": PROVIDER})
    logger.info(
        "[DELHIVERY] tenant=%s operation=save_settings status=success enabled=%s",
        scoped,
        body.enabled,
    )
    return {
        "success": True,
        "message": "Delhivery settings saved.",
        "data": _public_integration(saved, include_pickup=_active_location(scoped)),
    }


@router.post("/test")
def test_delhivery_connection(
    body: DelhiveryTestRequest,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    service = DelhiveryService()
    try:
        result = service.test_connection(scoped, body.pincode)
    except DelhiveryError as error:
        raise _provider_error(error) from error
    return {
        "success": True,
        "message": "Connection successful.",
        "data": result,
    }


@router.get("/pincode-check")
def public_pincode_check(
    pincode: Annotated[str, Query(min_length=6, max_length=6, pattern=r"^\d{6}$")],
    tenant_id: Annotated[str, Query(alias="tenantId")],
):
    scoped = str(tenant_id or "").strip().lower()
    tenant = tenants.find_one(
        {
            "isActive": True,
            "$or": [
                {"tenantId": tenant_id_query(scoped)},
                {"slug": tenant_id_query(scoped)},
            ],
        }
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Store not found.")
    store_id = str(tenant.get("tenantId") or scoped).strip().lower()
    ctx = get_active_shipping_context(store_id)
    if not ctx:
        return {
            "success": True,
            "connected": False,
            "serviceable": False,
            "cod": False,
            "pincode": pincode,
            "shippingOptions": [],
            "message": "Delivery partner is not connected for this store.",
        }
    provider = ctx["provider"]
    display = partner_display_name(provider)
    service = ConfigPartnerService(provider)
    try:
        data = service.check_serviceability(store_id, pincode)
    except DelhiveryError as error:
        return {
            "success": True,
            "connected": True,
            "serviceable": False,
            "cod": False,
            "pincode": pincode,
            "code": error.code,
            "shippingOptions": [],
            "message": str(error)
            or "Unable to confirm delivery for this pincode right now.",
        }
    if not data.get("serviceable"):
        return {
            "success": True,
            "connected": True,
            "serviceable": False,
            "cod": False,
            "pincode": pincode,
            "shippingOptions": [],
            "message": f"{display} does not deliver to this pincode.",
        }
    options = []
    try:
        options = service.get_checkout_rate_options(
            store_id,
            origin_pin=ctx["originPin"],
            destination_pin=pincode,
        )
    except DelhiveryError:
        options = []
    if data.get("estimatedDays"):
        for option in options:
            if not option.get("estimatedDays"):
                option["estimatedDays"] = data["estimatedDays"]
    city = str(data.get("city") or "").strip()
    location = f" to {city}" if city else ""
    cod = bool(data.get("cod"))
    if options:
        quotes = "; ".join(
            f"{opt['mode']} ₹{opt['shippingCost']:.0f}"
            + (
                f" ({opt['estimatedDays']} days)"
                if opt.get("estimatedDays")
                else ""
            )
            for opt in options
        )
        eta = next(
            (opt.get("estimatedDays") for opt in options if opt.get("estimatedDays")),
            data.get("estimatedDays"),
        )
        eta_line = f" Estimated delivery in {eta} business days." if eta else ""
        cod_line = (
            " Cash on delivery is available."
            if cod
            else " Cash on delivery is not available for this pincode."
        )
        message = (
            f"Delivery available{location} via {display}. {quotes}.{eta_line}{cod_line}"
        )
    else:
        eta = data.get("estimatedDays")
        eta_line = (
            f" Estimated delivery in {eta} business days."
            if eta
            else " Delivery time will be confirmed at checkout."
        )
        message = (
            f"Delivery available{location} via {display}.{eta_line} "
            "Shipping charges will be calculated at checkout."
        )
    payload = {
        "success": True,
        "connected": True,
        "serviceable": True,
        "cod": cod,
        "prepaid": bool(data.get("prepaid")),
        "pincode": pincode,
        "city": city or None,
        "estimatedDays": data.get("estimatedDays")
        or (options[0].get("estimatedDays") if options else None),
        "shippingOptions": options,
        "message": message,
    }
    return payload


@router.get("/serviceability")
def small_parcel_serviceability(
    current_user: Annotated[dict, Depends(require_admin)],
    pincode: Annotated[str, Query(min_length=6, max_length=6, pattern=r"^\d{6}$")],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    try:
        data = DelhiveryService().check_small_parcel_serviceability(scoped, pincode)
    except DelhiveryError as error:
        raise _provider_error(error) from error
    return data


@router.get("/serviceability/heavy")
def heavy_serviceability(
    current_user: Annotated[dict, Depends(require_admin)],
    pincode: Annotated[str, Query(min_length=6, max_length=6, pattern=r"^\d{6}$")],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    try:
        data = DelhiveryService().check_heavy_serviceability(scoped, pincode)
    except DelhiveryError as error:
        raise _provider_error(error) from error
    return data


@router.post("/warehouse")
def create_warehouse(
    body: DelhiveryWarehouseRequest,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    service = DelhiveryService()
    try:
        result = service.create_warehouse(scoped, body.model_dump())
    except DelhiveryError as error:
        raise _provider_error(error) from error

    now = _now()
    location_doc = {
        "tenantId": scoped,
        "provider": PROVIDER,
        "name": result["name"],
        "city": body.city,
        "state": body.return_state,
        "pincode": body.pin,
        "phone": body.phone,
        "email": body.email,
        "address": body.address,
        "active": True,
        "updatedAt": now,
    }
    try:
        shipping_locations.update_many(
            {"tenantId": scoped, "provider": PROVIDER, "active": True},
            {"$set": {"active": False, "updatedAt": now}},
        )
        existing = shipping_locations.find_one(
            {"tenantId": scoped, "provider": PROVIDER, "name": result["name"]}
        )
        if existing:
            shipping_locations.update_one(
                {"_id": existing["_id"]},
                {"$set": {**location_doc}},
            )
        else:
            location_doc["createdAt"] = now
            shipping_locations.insert_one(location_doc)

        shipping_integrations.update_one(
            {"tenantId": scoped, "provider": PROVIDER},
            {
                "$set": {
                    "pickupLocationName": result["name"],
                    "updatedAt": now,
                }
            },
        )
    except PyMongoError as error:
        logger.exception(
            "[DELHIVERY] tenant=%s operation=save_warehouse status=db_error", scoped
        )
        raise HTTPException(
            status_code=500, detail="Warehouse created on Delhivery but failed to save locally."
        ) from error

    return {
        "success": True,
        "message": result.get("rawMessage") or "Pickup location registered.",
        "data": {
            "name": result["name"],
            "pickupLocation": _active_location(scoped),
        },
    }


@router.get("/waybills")
def fetch_waybills(
    current_user: Annotated[dict, Depends(require_admin)],
    count: Annotated[int, Query(ge=1, le=50)] = 30,
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    try:
        data = DelhiveryService().fetch_waybills(scoped, count)
    except DelhiveryError as error:
        raise _provider_error(error) from error
    return data


@router.post("/rate")
def calculate_rate(
    body: DelhiveryRateRequest,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    ctx = get_active_delhivery_context(scoped)
    if not ctx:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "provider": PROVIDER,
                "code": "NOT_READY",
                "message": "Connect Delhivery and register a pickup location first.",
            },
        )
    service = DelhiveryService()
    try:
        options = service.get_checkout_rate_options(
            scoped,
            origin_pin=ctx["originPin"],
            destination_pin=body.deliveryPincode,
            weight_grams=body.weight,
            payment_mode=body.paymentMode,
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error
    return {"success": True, "options": options}


@router.post("/shipments")
def create_shipment(
    body: CreateDelhiveryShipmentRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    ctx = get_active_delhivery_context(scoped)
    if not ctx:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "provider": PROVIDER,
                "code": "NOT_READY",
                "message": "Connect Delhivery and register a pickup location first.",
            },
        )
    if not ObjectId.is_valid(body.orderId):
        raise HTTPException(status_code=400, detail="Invalid order id.")

    order = orders.find_one({"_id": ObjectId(body.orderId), "tenantId": scoped})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    existing = shipments.find_one(
        {"tenantId": scoped, "orderId": str(order["_id"]), "provider": PROVIDER}
    )
    if existing and existing.get("awb"):
        send_shipment_created(background_tasks, str(order["_id"]))
        return {
            "success": True,
            "message": "Shipment already exists.",
            "data": {
                "shipmentId": str(existing["_id"]),
                "awb": existing.get("awb"),
                "trackingUrl": existing.get("trackingUrl"),
                "status": existing.get("status"),
                "labelUrl": existing.get("labelUrl"),
            },
        }

    status = str(order.get("orderStatus") or "")
    if status in {"cancelled", "delivered"}:
        raise HTTPException(status_code=400, detail=f"Cannot ship an order that is {status}.")

    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    phone = str(address.get("phone") or "").strip()
    pin = str(address.get("postalCode") or "").strip()
    line1 = str(address.get("addressLine1") or "").strip()
    if not phone or not pin or not line1:
        raise HTTPException(
            status_code=400,
            detail="Order address must include phone, postal code, and address line.",
        )

    payment_method = str(order.get("paymentMethod") or "").lower()
    total_amount = float(order.get("totalAmount") or 0)
    is_cod = payment_method in {"cod", "cash_on_delivery"}
    payment_mode = "COD" if is_cod else "Prepaid"
    cod_amount = total_amount if is_cod else 0

    items = order.get("items") if isinstance(order.get("items"), list) else []
    products_desc = (
        ", ".join(str(item.get("name") or "Item")[:40] for item in items[:5])
        or "Retail goods"
    )
    weight = int(body.weightGrams or 500)
    now = _now()

    try:
        result = DelhiveryService().create_forward_shipment(
            scoped,
            pickup_location_name=ctx["pickupLocationName"],
            order_id=str(order["_id"]),
            consignee_name=str(address.get("fullName") or "Customer"),
            consignee_phone=phone,
            address=" ".join(
                part
                for part in [line1, str(address.get("addressLine2") or "").strip()]
                if part
            ),
            city=str(address.get("city") or ""),
            state=str(address.get("state") or ""),
            pincode=pin,
            country=str(address.get("country") or "India"),
            payment_mode=payment_mode,
            total_amount=total_amount,
            cod_amount=cod_amount,
            products_description=products_desc,
            weight_grams=weight,
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error

    label_url = DelhiveryService().packing_slip_url(result["waybill"])
    shipment_doc = {
        "tenantId": scoped,
        "orderId": str(order["_id"]),
        "provider": PROVIDER,
        "awb": result["waybill"],
        "pickupLocation": ctx["pickupLocationName"],
        "status": "ready_for_pickup",
        "shippingMode": order.get("deliveryMethod") or "standard",
        "labelUrl": label_url,
        "trackingNumber": result["waybill"],
        "trackingUrl": result["trackingUrl"],
        "trackingStatus": None,
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        if existing:
            shipments.update_one({"_id": existing["_id"]}, {"$set": shipment_doc})
            shipment_id = str(existing["_id"])
        else:
            inserted = shipments.insert_one(shipment_doc)
            shipment_id = str(inserted.inserted_id)
    except PyMongoError as error:
        # Unique race: return existing if another request won.
        raced = shipments.find_one(
            {"tenantId": scoped, "orderId": str(order["_id"]), "provider": PROVIDER}
        )
        if raced and raced.get("awb"):
            send_shipment_created(background_tasks, str(order["_id"]))
            return {
                "success": True,
                "message": "Shipment already exists.",
                "data": {
                    "shipmentId": str(raced["_id"]),
                    "awb": raced.get("awb"),
                    "trackingUrl": raced.get("trackingUrl"),
                    "status": raced.get("status"),
                    "labelUrl": raced.get("labelUrl"),
                },
            }
        raise HTTPException(status_code=500, detail="Failed to save shipment.") from error

    order_set = {
        "courier": {
            "provider": PROVIDER,
            "waybill": result["waybill"],
            "trackingUrl": result["trackingUrl"],
            "labelUrl": label_url,
            "pickupLocation": ctx["pickupLocationName"],
            "shippedAt": now,
        },
        "updatedAt": now,
    }
    if body.markShipped and status in {"confirmed", "processing"}:
        order_set["orderStatus"] = "shipped"
    orders.update_one({"_id": order["_id"]}, {"$set": order_set})
    send_shipment_created(background_tasks, str(order["_id"]))

    return {
        "success": True,
        "message": "Shipment created on Delhivery.",
        "data": {
            "shipmentId": shipment_id,
            "awb": result["waybill"],
            "trackingUrl": result["trackingUrl"],
            "labelUrl": label_url,
            "status": "ready_for_pickup",
            "orderStatus": order_set.get("orderStatus", status),
        },
    }


@router.get("/track/{awb}")
def track_awb(
    awb: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    owned = shipments.find_one({"tenantId": scoped, "provider": PROVIDER, "awb": awb})
    if not owned:
        # Also allow track if order courier matches
        order_hit = orders.find_one(
            {"tenantId": scoped, "courier.waybill": awb},
            {"_id": 1},
        )
        if not order_hit:
            raise HTTPException(status_code=404, detail="AWB not found for this store.")
    try:
        data = DelhiveryService().track_shipment(scoped, awb)
    except DelhiveryError as error:
        raise _provider_error(error) from error
    if owned:
        shipments.update_one(
            {"_id": owned["_id"]},
            {
                "$set": {
                    "trackingStatus": data.get("status"),
                    "updatedAt": _now(),
                }
            },
        )
    return {"success": True, "data": data}


@router.get("/shipments/{shipment_id}/label")
def get_label(
    shipment_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(shipment_id):
        raise HTTPException(status_code=400, detail="Invalid shipment id.")
    doc = shipments.find_one(
        {"_id": ObjectId(shipment_id), "tenantId": scoped, "provider": PROVIDER}
    )
    if not doc or not doc.get("awb"):
        raise HTTPException(status_code=404, detail="Shipment not found.")
    label_url = doc.get("labelUrl") or DelhiveryService().packing_slip_url(doc["awb"])
    return {
        "success": True,
        "data": {"labelUrl": label_url, "awb": doc.get("awb")},
    }


@router.post("/pickup")
def request_pickup(
    body: DelhiveryPickupRequest,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    ctx = get_active_delhivery_context(scoped)
    if not ctx:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "provider": PROVIDER,
                "code": "NOT_READY",
                "message": "Connect Delhivery and register a pickup location first.",
            },
        )

    ready_statuses = {"ready_for_pickup", "pickup_requested", "shipped", "manifested"}
    blocked = {"cancelled", "delivered", "rto"}

    docs: list[dict] = []
    if body.shipmentIds:
        for sid in body.shipmentIds:
            if not ObjectId.is_valid(sid):
                raise HTTPException(status_code=400, detail=f"Invalid shipment id: {sid}")
            doc = shipments.find_one(
                {"_id": ObjectId(sid), "tenantId": scoped, "provider": PROVIDER}
            )
            if not doc:
                raise HTTPException(status_code=404, detail=f"Shipment not found: {sid}")
            docs.append(doc)
    else:
        # Default: all ready shipments without an active pickup id
        docs = list(
            shipments.find(
                {
                    "tenantId": scoped,
                    "provider": PROVIDER,
                    "awb": {"$exists": True, "$ne": ""},
                    "status": {"$in": list(ready_statuses)},
                    "$or": [
                        {"pickupId": {"$exists": False}},
                        {"pickupId": None},
                        {"pickupId": ""},
                    ],
                }
            ).limit(100)
        )

    if not docs:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "provider": PROVIDER,
                "code": "NO_SHIPMENTS",
                "message": "No ready Delhivery shipments to pick up.",
            },
        )

    for doc in docs:
        status = str(doc.get("status") or "").lower()
        if status in blocked:
            raise HTTPException(
                status_code=400,
                detail=f"Shipment {doc.get('awb')} cannot be picked up ({status}).",
            )
        if not doc.get("awb"):
            raise HTTPException(
                status_code=400,
                detail="Shipment is missing AWB.",
            )

    # Idempotency: if all already share one pickupId, return it
    existing_ids = {str(d.get("pickupId") or "") for d in docs}
    existing_ids.discard("")
    if len(existing_ids) == 1 and len(docs) >= 1:
        only = next(iter(existing_ids))
        return {
            "success": True,
            "message": "Pickup already requested for these shipments.",
            "data": {
                "pickupId": only,
                "expectedPackageCount": len(docs),
                "shipmentIds": [str(d["_id"]) for d in docs],
            },
        }

    from datetime import date

    pickup_date = body.pickupDate or date.today().isoformat()
    pickup_time = body.pickupTime or "18:00:00"

    try:
        result = DelhiveryService().create_pickup_request(
            scoped,
            pickup_location=ctx["pickupLocationName"],
            pickup_date=pickup_date,
            pickup_time=pickup_time,
            expected_package_count=len(docs),
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error

    now = _now()
    shipment_ids = [d["_id"] for d in docs]
    shipments.update_many(
        {"_id": {"$in": shipment_ids}},
        {
            "$set": {
                "status": "pickup_requested",
                "pickupId": result.get("pickupId"),
                "pickupDate": pickup_date,
                "pickupTime": pickup_time,
                "pickupRequestedAt": now,
                "updatedAt": now,
            }
        },
    )

    return {
        "success": True,
        "message": "Pickup request created with Delhivery.",
        "data": {
            "pickupId": result.get("pickupId"),
            "pickupLocation": result.get("pickupLocation"),
            "pickupDate": pickup_date,
            "pickupTime": pickup_time,
            "expectedPackageCount": len(docs),
            "shipmentIds": [str(sid) for sid in shipment_ids],
            "awbs": [str(d.get("awb")) for d in docs if d.get("awb")],
        },
    }