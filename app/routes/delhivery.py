"""Tenant-scoped Delhivery shipping routes."""

from __future__ import annotations

import hmac
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pymongo.errors import PyMongoError
from starlette.concurrency import run_in_threadpool

from app.config import DELHIVERY_WEBHOOK_TOKEN

from app.database.mongo import (
    addresses,
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
from app.services import shipment_sync
from app.services.whatsapp_notification_service import send_shipment_created
from app.utils.auth_dependencies import admin_tenant_id, require_permission
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    payload = body.model_dump()
    payload["state"] = body.state
    payload["return_state"] = body.return_state or body.state
    existing_named = shipping_locations.find_one(
        {"tenantId": scoped, "provider": PROVIDER, "name": body.name.strip()}
    )
    service = DelhiveryService()
    try:
        result = service.create_warehouse(
            scoped,
            payload,
            update=bool(existing_named),
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error

    now = _now()
    location_doc = {
        "tenantId": scoped,
        "provider": PROVIDER,
        "name": result["name"],
        "city": body.city,
        "state": body.state or body.return_state,
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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


def _consignee_address_text(address: dict) -> str:
    street = " ".join(
        part
        for part in [
            str(address.get("addressLine1") or "").strip(),
            str(address.get("addressLine2") or "").strip(),
        ]
        if part
    )
    city = str(address.get("city") or "").strip()
    state = str(address.get("state") or "").strip()
    pin = "".join(ch for ch in str(address.get("postalCode") or "") if ch.isdigit())
    country = str(address.get("country") or "India").strip() or "India"
    locality = ", ".join(part for part in [city, state] if part)
    if locality and pin:
        locality = f"{locality} - {pin}"
    elif pin:
        locality = pin
    return ", ".join(part for part in [street, locality, country] if part)[:350]


@router.post("/shipments")
def create_shipment(
    body: CreateDelhiveryShipmentRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    address_id = address.get("_id") or order.get("addressId")
    if address_id and ObjectId.is_valid(str(address_id)):
        live = addresses.find_one({"_id": ObjectId(str(address_id))})
        if live:
            address = {
                **address,
                **{
                    key: live.get(key)
                    for key in (
                        "fullName",
                        "phone",
                        "addressLine1",
                        "addressLine2",
                        "city",
                        "state",
                        "country",
                        "postalCode",
                    )
                    if live.get(key)
                },
            }
    phone = str(address.get("phone") or "").strip()
    pin = str(address.get("postalCode") or "").strip()
    line1 = str(address.get("addressLine1") or "").strip()
    city = str(address.get("city") or "").strip()
    state = str(address.get("state") or "").strip()
    full_address = _consignee_address_text(address)
    if not phone or not pin or not line1 or not city or not state:
        raise HTTPException(
            status_code=400,
            detail="Order address must include phone, full street, city, state, and postal code.",
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
            address=full_address,
            city=city,
            state=state,
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
        "weightGrams": weight,
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
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
        # Same forward-only order mapping as the background sync.
        try:
            data["sync"] = shipment_sync.apply_tracking_update(
                owned, data, background_tasks=background_tasks, source="admin-track"
            )
        except Exception:
            logger.exception("Failed to apply tracking for AWB %s", awb)
        try:
            # A newly closed shipment already had its charge synced above;
            # this retries it for shipments that closed earlier.
            if owned.get("syncDone"):
                from app.services.ledger_service import sync_delivery_charge_for_order

                sync_delivery_charge_for_order(owned["orderId"], scoped)
        except Exception:
            # Delhivery may not have finalized a charge yet — never let this
            # block a tracking refresh.
            logger.exception(
                "Failed to sync delivery charge for order %s", owned.get("orderId")
            )
    return {"success": True, "data": data}


@router.post("/orders/{order_id}/sync")
def sync_order_shipment_now(
    order_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    """Pull Delhivery tracking for one order now and apply it to the order."""
    scoped = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order id.")
    shipment = shipments.find_one(
        {"tenantId": scoped, "orderId": str(ObjectId(order_id)), "provider": PROVIDER}
    )
    if not shipment or not shipment.get("awb"):
        raise HTTPException(status_code=404, detail="No Delhivery shipment for this order.")
    try:
        summary = shipment_sync.sync_shipment(
            shipment, background_tasks=background_tasks, source="admin"
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error
    order = orders.find_one(
        {"_id": ObjectId(order_id), "tenantId": scoped},
        {"orderStatus": 1, "paymentStatus": 1, "courier": 1},
    ) or {}
    courier = order.get("courier") if isinstance(order.get("courier"), dict) else {}
    return {
        "success": True,
        "data": {
            "awb": shipment.get("awb"),
            **summary,
            "orderStatus": order.get("orderStatus"),
            "changedTo": summary.get("orderStatus"),
            "paymentStatus": order.get("paymentStatus"),
            "courierException": courier.get("exception"),
        },
    }


def _webhook_token(request: Request) -> str:
    auth = str(request.headers.get("authorization") or "").strip()
    for prefix in ("bearer ", "token "):
        if auth.lower().startswith(prefix):
            return auth[len(prefix):].strip()
    return str(
        request.headers.get("x-webhook-token")
        or request.query_params.get("token")
        or auth
        or ""
    ).strip()


@router.post("/webhook")
async def delhivery_status_webhook(request: Request, background_tasks: BackgroundTasks):
    """Delhivery scan push ("Tracking via PUSH API"). Delhivery configures the
    URL and the header per client account on request; send the shared
    DELHIVERY_WEBHOOK_TOKEN as `Authorization: Bearer <token>` (or
    `X-Webhook-Token`, or `?token=` if they can only take a URL)."""
    expected = str(DELHIVERY_WEBHOOK_TOKEN or "")
    if not expected:
        raise HTTPException(status_code=503, detail="Webhook is not configured.")
    provided = _webhook_token(request)
    if not provided or not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid webhook token.")
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="Body must be JSON.") from error
    results = []
    for raw_shipment in shipment_sync.extract_push_shipments(payload):
        try:
            result = await run_in_threadpool(
                shipment_sync.apply_push_update,
                raw_shipment,
                background_tasks=background_tasks,
            )
        except Exception:
            logger.exception("[DELHIVERY] webhook scan failed")
            result = {"result": "error"}
        results.append(
            {key: result.get(key) for key in ("awb", "result", "outcome", "orderStatus")}
        )
    # Always 200 once authenticated so Delhivery doesn't retry scans we chose to skip.
    return {"success": True, "processed": len(results), "results": results}


def _packing_slip_fallback(order: dict | None, waybill: str) -> dict:
    if not isinstance(order, dict):
        return {"wbn": waybill}
    address = order.get("address") if isinstance(order.get("address"), dict) else {}
    items = order.get("items") if isinstance(order.get("items"), list) else []
    payment_method = str(order.get("paymentMethod") or "").lower()
    is_cod = payment_method in {"cod", "cash_on_delivery"}
    try:
        total_amount = float(order.get("totalAmount") or 0)
    except (TypeError, ValueError):
        total_amount = 0.0
    oid = str(order.get("orderNumber") or order.get("_id") or "")
    return {
        "wbn": waybill,
        "oid": oid[-10:] if len(oid) > 10 else oid,
        "cn": str(address.get("fullName") or "").strip(),
        "add": _consignee_address_text(address),
        "pin": str(address.get("postalCode") or "").strip(),
        "cty": str(address.get("city") or "").strip(),
        "st": str(address.get("state") or "").strip(),
        "ph": str(address.get("phone") or "").strip(),
        "pt": "COD" if is_cod else "Prepaid",
        "cod": total_amount if is_cod else 0,
        "rs": total_amount,
        "prd": ", ".join(str(item.get("name") or "Item")[:40] for item in items[:5]) or "Order",
    }


@router.get("/packing-slip/{awb}")
def download_packing_slip(
    awb: str,
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    waybill = str(awb or "").strip()
    owned = shipments.find_one({"tenantId": scoped, "provider": PROVIDER, "awb": waybill})
    order_hit = orders.find_one({"tenantId": scoped, "courier.waybill": waybill})
    if not owned and not order_hit:
        raise HTTPException(status_code=404, detail="AWB not found for this store.")
    try:
        body, media_type = DelhiveryService().fetch_packing_slip(
            scoped,
            waybill,
            fallback=_packing_slip_fallback(order_hit, waybill),
        )
    except DelhiveryError as error:
        raise _provider_error(error) from error
    filename = f"packing-slip-{waybill}.pdf" if "pdf" in media_type else f"packing-slip-{waybill}.html"
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/shipments/{shipment_id}/label")
def get_label(
    shipment_id: str,
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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
    current_user: Annotated[dict, Depends(require_permission("shipping"))],
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