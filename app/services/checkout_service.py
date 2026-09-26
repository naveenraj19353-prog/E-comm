from fastapi import HTTPException
from bson import ObjectId
from datetime import datetime, timezone
import re
from app.database.mongo import (
    carts,
    products,
    addresses,
)


def normalize_tenant_id(value) -> str:
    return str(value or "").strip().lower()


def tenant_id_query(tenant_id: str) -> dict:
    normalized = re.escape(normalize_tenant_id(tenant_id))
    return {
        "$regex": f"^{normalized}$",
        "$options": "i",
    }


def as_object_id(value):
    if isinstance(value, ObjectId):
        return value
    value_str = str(value)
    if ObjectId.is_valid(value_str):
        return ObjectId(value_str)
    return None


def cart_owner_query(tenant_id: str, user_id: str) -> dict:
    object_id = as_object_id(user_id)
    user_values: list = [user_id]
    if object_id:
        user_values.extend([object_id, str(object_id)])
    unique_values = []
    for value in user_values:
        if value not in unique_values:
            unique_values.append(value)
    return {
        "tenantId": tenant_id_query(tenant_id),
        "userId": {"$in": unique_values},
    }


def product_id_query(product_id) -> dict:
    object_id = as_object_id(product_id)
    values: list = [product_id]
    if object_id:
        values.extend([object_id, str(object_id)])
    unique_values = []
    for value in values:
        if value not in unique_values:
            unique_values.append(value)
    return {"$in": unique_values}


def find_active_product(product_id, tenant_id: str):
    object_id = as_object_id(product_id)
    if not object_id:
        return None
    product = products.find_one(
        {
            "_id": object_id,
            "isActive": True,
        }
    )
    if not product:
        return None
    if normalize_tenant_id(product.get("tenantId")) != normalize_tenant_id(
        tenant_id
    ):
        return None
    return product


def get_variant(product: dict, variant_id: str | None):
    if not variant_id:
        return None
    for variant in product.get("inventory") or []:
        if not isinstance(variant, dict):
            continue
        if str(variant.get("variantId", "")) == str(variant_id):
            return variant
    return None


def _first_grouped_image(images: dict):
    for color_images in images.values():
        if isinstance(color_images, list) and color_images:
            return color_images[0]
    return None


def get_variant_image(product: dict, color: str | None):
    from app.utils.product_serialize import _resolve_image_for_response

    images = product.get("images", {})
    raw_image = None
    if isinstance(images, list):
        raw_image = images[0] if images else None
    elif isinstance(images, dict):
        selected_images = images.get(color) if color else None
        if isinstance(selected_images, list) and selected_images:
            raw_image = selected_images[0]
        else:
            raw_image = _first_grouped_image(images)

    if not isinstance(raw_image, str) or not raw_image.strip():
        return None
    return _resolve_image_for_response(raw_image) or None


def variant_stock(variant: dict | None) -> int:
    if not variant:
        return 0
    try:
        return int(variant.get("stock", 0) or 0)
    except (TypeError, ValueError):
        return 0


def serialize_address(address: dict | None) -> dict | None:
    if not address:
        return None
    return {
        "_id": str(address.get("_id") or ""),
        "fullName": str(address.get("fullName") or "").strip(),
        "phone": str(address.get("phone") or "").strip(),
        "addressLine1": str(address.get("addressLine1") or "").strip(),
        "addressLine2": str(address.get("addressLine2") or "").strip(),
        "city": str(address.get("city") or "").strip(),
        "state": str(address.get("state") or "").strip(),
        "country": str(address.get("country") or "India").strip() or "India",
        "postalCode": str(address.get("postalCode") or "").strip(),
        "addressType": address.get("addressType") or "Home",
    }


def resolve_shipping_address(
    tenant_id: str,
    user_id: str,
    address_id: str | None = None,
    required: bool = False,
) -> dict | None:
    owner_query = cart_owner_query(tenant_id, user_id)
    if address_id:
        object_id = as_object_id(address_id)
        if not object_id:
            raise HTTPException(
                status_code=400,
                detail="Invalid delivery address.",
            )
        address = addresses.find_one(
            {
                "_id": object_id,
                **owner_query,
            }
        )
        if not address:
            raise HTTPException(
                status_code=404,
                detail="Selected delivery address was not found.",
            )
        return serialize_address(address)
    address = addresses.find_one(
        {
            **owner_query,
            "isDefault": True,
        }
    )
    if not address:
        address = addresses.find_one(owner_query)
    if required and not address:
        raise HTTPException(
            status_code=400,
            detail="Please add a delivery address before placing the order.",
        )
    return serialize_address(address)


def _load_cart_items(tenant_id: str, user_id: str) -> list:
    cart_items = list(carts.find(cart_owner_query(tenant_id, user_id)))
    if not cart_items:
        raise HTTPException(
            status_code=404,
            detail="Cart is empty.",
        )
    return cart_items


def _resolve_cart_item(cart_item: dict, tenant_id: str):
    product = find_active_product(
        cart_item.get("productId"),
        tenant_id,
    )
    if not product:
        carts.delete_one({"_id": cart_item["_id"]})
        return None

    variant = get_variant(product, cart_item.get("variantId"))
    if not variant:
        carts.delete_one({"_id": cart_item["_id"]})
        return None

    quantity = int(cart_item.get("quantity", 0) or 0)
    stock = variant_stock(variant)
    if quantity <= 0 or stock <= 0:
        carts.delete_one({"_id": cart_item["_id"]})
        return None
    if quantity > stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{product['name']} has only "
                f"{stock} item(s) in stock."
            ),
        )
    return product, variant, quantity


def _build_checkout_item(product: dict, variant: dict, quantity: int) -> dict:
    price = float(product["finalPrice"])
    line_total = round(price * quantity, 2)
    color = variant.get("color")
    return {
        "productId": str(product["_id"]),
        "variantId": str(variant.get("variantId")),
        "name": product["name"],
        "price": price,
        "quantity": quantity,
        "subtotal": line_total,
        "color": color,
        "size": variant.get("size"),
        "image": get_variant_image(product, color),
        # For category coupons (REQ-085); order lines are built without it.
        "categoryId": product.get("categoryId"),
    }


def _price_cart_items(cart_items: list, tenant_id: str) -> tuple[list, float]:
    items = []
    subtotal = 0.0
    for cart_item in cart_items:
        resolved_item = _resolve_cart_item(cart_item, tenant_id)
        if not resolved_item:
            continue
        item = _build_checkout_item(*resolved_item)
        items.append(item)
        subtotal += item["subtotal"]
    if not items:
        raise HTTPException(
            status_code=400,
            detail=(
                "Your cart products are no longer available. "
                "Please add items again."
            ),
        )
    return items, round(subtotal, 2)


def _apply_coupon(
    tenant_id: str,
    coupon_code: str | None,
    subtotal: float,
    *,
    user_id: str | None = None,
    items: list[dict] | None = None,
) -> tuple[float, str | None]:
    from app.services.coupon_service import apply_coupon_discount

    return apply_coupon_discount(
        tenant_id,
        coupon_code,
        subtotal,
        user_id=user_id,
        items=items,
    )


def _checkout_totals(
    subtotal: float,
    discount: float,
    delivery_method: str,
    *,
    shipping_override: float | None = None,
) -> tuple[str, float, float]:
    normalized_delivery = (
        delivery_method
        if delivery_method in {"standard", "express"}
        else "standard"
    )
    if shipping_override is not None:
        shipping = round(float(shipping_override), 2)
    else:
        shipping = 0.0
    net_subtotal = max(subtotal - discount, 0)
    grand_total = round(net_subtotal + shipping, 2)
    if grand_total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid checkout amount.",
        )
    return normalized_delivery, shipping, grand_total


def _rate_payment_mode(payment_method: str | None) -> str:
    return "COD" if str(payment_method or "").strip().lower() == "cod" else "Prepaid"


SHIP_RATE_CACHE_SECONDS = 180


def _cached_rate_options(
    service,
    tenant_id: str,
    *,
    origin_pin: str,
    destination_pin: str,
    payment_mode: str,
) -> list[dict]:
    """The partner's rate quote, short-cached: it changes rarely for a given
    lane and this runs on every checkout preview, so we don't spend the
    partner's request budget re-quoting the same route seconds apart."""
    from app.services.cache import storefront_cache
    from app.services.delhivery_service import DelhiveryError

    key = (
        str(tenant_id),
        "shipping_rate",
        service.provider,
        origin_pin,
        destination_pin,
        payment_mode,
    )

    def build() -> list[dict]:
        try:
            return service.get_checkout_rate_options(
                tenant_id,
                origin_pin=origin_pin,
                destination_pin=destination_pin,
                payment_mode=payment_mode,
            )
        except DelhiveryError:
            return []

    return storefront_cache.get_or_set(key, build, SHIP_RATE_CACHE_SECONDS)


def _cod_handling_charge(
    options_by_mode: dict[str, list[dict]],
    delivery_method: str,
) -> float | None:
    """Delhivery bills COD shipments more than prepaid ones for the same
    lane and weight; the difference is what we show customers as the COD
    handling charge. None when either quote is unavailable."""
    normalized = delivery_method if delivery_method in {"standard", "express"} else "standard"

    def _cost_for(mode: str) -> float | None:
        options = options_by_mode.get(mode) or []
        selected = next((opt for opt in options if opt.get("id") == normalized), None)
        selected = selected or (options[0] if options else None)
        if not selected or selected.get("shippingCost") is None:
            return None
        return float(selected["shippingCost"])

    prepaid_cost = _cost_for("Prepaid")
    cod_cost = _cost_for("COD")
    if prepaid_cost is None or cod_cost is None:
        return None
    return round(max(cod_cost - prepaid_cost, 0.0), 2)


def _free_delivery_threshold(tenant_id: str) -> float | None:
    """The store's free-delivery order value (REQ-087); None when not set."""
    from app.database.mongo import tenants

    tenant = tenants.find_one(
        {"tenantId": tenant_id_query(tenant_id)}, {"freeDeliveryThreshold": 1}
    ) or {}
    try:
        value = float(tenant.get("freeDeliveryThreshold") or 0)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _free_delivery_options(
    options: list[dict],
    prepaid_options: list[dict],
    payment_mode: str,
) -> list[dict]:
    """Delivery is free above the store's threshold (REQ-087). A COD order still
    pays the COD handling part: that option's COD quote minus its prepaid quote.
    Returns new dicts (the quotes are cached and must not be changed)."""
    prepaid_by_id = {opt.get("id"): opt for opt in prepaid_options}
    free = []
    for opt in options:
        cost = 0.0
        prepaid = prepaid_by_id.get(opt.get("id"))
        if payment_mode == "COD" and prepaid and prepaid.get("shippingCost") is not None:
            cost = max(float(opt.get("shippingCost") or 0) - float(prepaid["shippingCost"]), 0.0)
        free.append(
            {
                **opt,
                "shippingCost": round(cost, 2),
                "originalShippingCost": opt.get("shippingCost"),
                "freeDelivery": True,
            }
        )
    return free


def _partner_shipping(
    tenant_id: str,
    address: dict | None,
    delivery_method: str,
    *,
    require_quote: bool = False,
    payment_method: str | None = None,
    free_delivery: bool = False,
) -> tuple[float | None, list[dict], dict]:
    """Return (selected_fee, options, meta). fee None => no partner quote yet."""
    from app.services.delhivery_service import DelhiveryError
    from app.services.shipping_adapter import ConfigPartnerService
    from app.services.shipping_context import get_active_shipping_context
    from app.services.shipping_partner_config import partner_display_name

    ctx = get_active_shipping_context(tenant_id)
    if not ctx:
        return None, [], {
            "provider": None,
            "serviceable": None,
            "message": "Delivery partner is not connected. Shipping is not quoted.",
        }

    provider = ctx["provider"]
    display = partner_display_name(provider)

    dest_pin = "".join(
        ch for ch in str((address or {}).get("postalCode") or "") if ch.isdigit()
    )
    if len(dest_pin) != 6:
        return None, [], {
            "provider": provider,
            "serviceable": None,
            "message": "Select a delivery address to calculate partner rates.",
        }

    service = ConfigPartnerService(provider)
    try:
        serviceability = service.check_serviceability(tenant_id, dest_pin)
    except DelhiveryError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error) or "Unable to check delivery for this pincode.",
        ) from error

    if not serviceability.get("serviceable"):
        raise HTTPException(
            status_code=400,
            detail=f"{display} does not deliver to this pincode.",
        )

    selected_mode = _rate_payment_mode(payment_method)
    other_mode = "Prepaid" if selected_mode == "COD" else "COD"
    options = _cached_rate_options(
        service,
        tenant_id,
        origin_pin=ctx["originPin"],
        destination_pin=dest_pin,
        payment_mode=selected_mode,
    )
    # Also quote the other payment mode so we can tell the customer how much
    # of a COD order's shipping fee is the COD-handling part of it, per
    # Delhivery's own pricing for the same lane and weight.
    other_options = _cached_rate_options(
        service,
        tenant_id,
        origin_pin=ctx["originPin"],
        destination_pin=dest_pin,
        payment_mode=other_mode,
    )

    if not options:
        if require_quote:
            raise HTTPException(
                status_code=400,
                detail="Unable to calculate delivery charges from the partner. Try again.",
            )
        return None, [], {
            "provider": provider,
            "serviceable": True,
            "message": "Partner rates are unavailable right now.",
        }

    normalized = (
        delivery_method if delivery_method in {"standard", "express"} else "standard"
    )
    options_by_mode = {
        selected_mode: options,
        other_mode: other_options,
    }
    cod_handling_charge = _cod_handling_charge(options_by_mode, normalized)
    if free_delivery:
        options = _free_delivery_options(options, options_by_mode.get("Prepaid") or [], selected_mode)
    selected = next((opt for opt in options if opt.get("id") == normalized), options[0])
    return (
        float(selected["shippingCost"]),
        options,
        {
            "provider": provider,
            "serviceable": True,
            "originPin": ctx["originPin"],
            "destinationPin": dest_pin,
            "codHandlingCharge": cod_handling_charge,
            "freeDelivery": free_delivery,
        },
    )


def _assert_store_open(tenant_id: str) -> None:
    """Block new orders when the store is closed or offline for non-payment."""
    from app.database.mongo import tenants
    from app.services.billing_service import assert_store_operational
    from app.services.store_schedule import resolve_store_hours

    tenant = tenants.find_one(
        {"tenantId": tenant_id_query(tenant_id)},
        {"storeHours": 1, "billing": 1, "tenantId": 1, "isActive": 1},
    )
    if not tenant or tenant.get("isActive") is False:
        raise HTTPException(status_code=404, detail="Store not found or inactive.")
    assert_store_operational(tenant)
    hours = resolve_store_hours((tenant or {}).get("storeHours"))
    if not hours["isOpen"]:
        message = hours.get("message") or "The store is currently closed."
        raise HTTPException(status_code=409, detail=message)


def calculate_checkout(
    tenant_id: str,
    user_id: str,
    coupon_code: str | None = None,
    address_id: str | None = None,
    require_address: bool = False,
    delivery_method: str = "standard",
    payment_method: str | None = None,
    enforce_store_availability: bool = False,
):
    tenant_id = normalize_tenant_id(tenant_id)
    if enforce_store_availability:
        _assert_store_open(tenant_id)
    cart_items = _load_cart_items(tenant_id, user_id)
    items, subtotal = _price_cart_items(cart_items, tenant_id)
    discount, coupon_code_response = _apply_coupon(
        tenant_id,
        coupon_code,
        subtotal,
        user_id=user_id,
        items=items,
    )
    address = resolve_shipping_address(
        tenant_id,
        user_id,
        address_id=address_id,
        required=require_address,
    )
    free_delivery_threshold = _free_delivery_threshold(tenant_id)
    free_delivery = (
        free_delivery_threshold is not None
        and max(subtotal - discount, 0) >= free_delivery_threshold
    )
    shipping_override, shipping_options, shipping_meta = _partner_shipping(
        tenant_id,
        address,
        delivery_method,
        require_quote=require_address,
        payment_method=payment_method,
        free_delivery=free_delivery,
    )
    # `_checkout_totals` still runs for its validation (it rejects a
    # non-positive amount) and for the shipping figure. Its total is superseded
    # by the tax-aware one below, since an exclusive store's payable includes
    # GST that the legacy calculation knows nothing about.
    normalized_delivery, shipping, _legacy_total = _checkout_totals(
        subtotal,
        discount,
        delivery_method,
        shipping_override=shipping_override,
    )
    # GST is computed from the authoritative cart snapshot, never from client
    # values. A store with GST off gets a zero block and the unchanged total.
    from app.services.tax_service import calculate_order_tax, total_from_tax_snapshot

    try:
        tax = calculate_order_tax(
            tenant_id,
            items,
            discount=discount,
            shipping=shipping,
            destination_state=(address or {}).get("state"),
        )
    except ValueError as error:
        # Surfaced as a 400 rather than guessed at: an invoice split against the
        # wrong place of supply collects the wrong tax.
        raise HTTPException(status_code=400, detail=str(error)) from error
    grand_total = total_from_tax_snapshot(subtotal, discount, shipping, tax)
    return {
        "items": items,
        "subtotal": subtotal,
        "couponCode": coupon_code_response,
        "discount": discount,
        "shipping": shipping,
        "grandTotal": grand_total,
        "tax": tax,
        "deliveryMethod": normalized_delivery,
        "address": address,
        "shippingProvider": shipping_meta.get("provider"),
        "shippingOptions": shipping_options,
        "shippingQuoted": shipping_override is not None,
        "shippingMeta": shipping_meta,
        "codHandlingCharge": shipping_meta.get("codHandlingCharge"),
        "freeDelivery": free_delivery,
        "freeDeliveryThreshold": free_delivery_threshold,
    }


def apply_zero_shipping_totals(checkout_data: dict, tenant_id: str) -> dict:
    discount = float(checkout_data.get("discount") or 0)
    subtotal = float(checkout_data.get("subtotal") or 0)
    checkout_data["shipping"] = 0.0
    # Freight is itself taxed, so zeroing it changes the tax. Re-run the engine
    # against the snapshot rather than just dropping the delivery line.
    from app.services.tax_service import calculate_order_tax, total_from_tax_snapshot

    try:
        tax = calculate_order_tax(
            tenant_id,
            checkout_data.get("items") or [],
            discount=discount,
            shipping=0,
            destination_state=(checkout_data.get("address") or {}).get("state"),
        )
    except ValueError as error:
        # Menu/pickup orders can legitimately have no delivery address. An
        # unresolvable place of supply must surface as a clear 400 rather than
        # an uncaught ValueError turning into a 500.
        raise HTTPException(status_code=400, detail=str(error)) from error
    checkout_data["tax"] = tax
    checkout_data["grandTotal"] = total_from_tax_snapshot(subtotal, discount, 0, tax)
    return checkout_data
