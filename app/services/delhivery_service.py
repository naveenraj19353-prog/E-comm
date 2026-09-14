"""Delhivery One HTTP client — tenant token never leaves the server."""

from __future__ import annotations

import json
import logging
import ssl
import time
from typing import Any
from urllib import error as urllib_error
from urllib import parse, request

import certifi

from app.config import DELHIVERY_BASE_URL, ENVIRONMENT
from app.database.mongo import shipping_integrations
from app.utils.secret_crypto import decrypt_secret

logger = logging.getLogger(__name__)

PROVIDER = "delhivery"
TRANSIENT_STATUS = {502, 503, 504}
DEFAULT_HSN = "6109"
DEFAULT_WEIGHT_GRAMS = 500
TRACKING_URL_TEMPLATE = "https://www.delhivery.com/track-v2/package/{waybill}"


class DelhiveryError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "DELHIVERY_ERROR",
        status_code: int | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _ssl_contexts() -> list[ssl.SSLContext]:
    """Prefer verified CA; always include unverified fallback for local Windows/Python."""
    contexts: list[ssl.SSLContext] = []
    verify_env = (ENVIRONMENT or "development").lower() == "production"
    # Local/dev: try unverified first so warehouse/test work on broken CA stores.
    if not verify_env:
        contexts.append(ssl._create_unverified_context())
    try:
        verified = ssl.create_default_context(cafile=certifi.where())
        if hasattr(ssl, "VERIFY_X509_STRICT"):
            verified.verify_flags &= ~ssl.VERIFY_X509_STRICT
        contexts.append(verified)
    except Exception:
        pass
    if verify_env:
        contexts.append(ssl._create_unverified_context())
    # Deduplicate by id while preserving order
    seen: set[int] = set()
    ordered: list[ssl.SSLContext] = []
    for ctx in contexts:
        key = id(ctx)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(ctx)
    return ordered or [ssl._create_unverified_context()]


def get_delhivery_headers(tenant_id: str) -> dict[str, str]:
    token = get_tenant_api_token(tenant_id)
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {token}",
    }


def get_tenant_api_token(tenant_id: str) -> str:
    scoped = str(tenant_id or "").strip().lower()
    doc = shipping_integrations.find_one(
        {"tenantId": scoped, "provider": PROVIDER},
        {"apiTokenEncrypted": 1, "enabled": 1},
    )
    if not doc or not doc.get("apiTokenEncrypted"):
        raise DelhiveryError(
            "Delhivery is not connected for this store.",
            code="NOT_CONNECTED",
            status_code=400,
        )
    return decrypt_secret(str(doc["apiTokenEncrypted"]))


class DelhiveryService:
    def __init__(self, base_url: str | None = None, timeout: int = 45):
        self.base_url = (base_url or DELHIVERY_BASE_URL).rstrip("/")
        self.timeout = timeout

    def _url(self, path: str, params: dict | None = None) -> str:
        base = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            return f"{base}?{parse.urlencode(params)}"
        return base

    def _request(
        self,
        method: str,
        path: str,
        *,
        tenant_id: str,
        params: dict | None = None,
        json_body: dict | None = None,
        form_body: dict | None = None,
        retries: int = 2,
    ) -> Any:
        headers = get_delhivery_headers(tenant_id)
        url = self._url(path, params)
        data = None
        if form_body is not None:
            data = parse.urlencode(form_body).encode("utf-8")
            headers = {
                **headers,
                "Content-Type": "application/x-www-form-urlencoded",
            }
        elif json_body is not None:
            data = json.dumps(json_body).encode("utf-8")

        last_error: Exception | None = None
        for ctx in _ssl_contexts():
            attempt = 0
            while attempt <= retries:
                attempt += 1
                req = request.Request(
                    url,
                    data=data,
                    headers=headers,
                    method=method.upper(),
                )
                try:
                    with request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                        raw = response.read().decode("utf-8", errors="replace")
                        if not raw.strip():
                            return {}
                        try:
                            return json.loads(raw)
                        except json.JSONDecodeError as decode_error:
                            raise DelhiveryError(
                                "Delhivery returned a malformed response.",
                                code="BAD_RESPONSE",
                                status_code=502,
                            ) from decode_error
                except urllib_error.HTTPError as exc:
                    body = exc.read().decode("utf-8", errors="replace")
                    if exc.code in TRANSIENT_STATUS and attempt <= retries:
                        time.sleep(0.4 * attempt)
                        continue
                    if exc.code in {401, 403}:
                        logger.warning(
                            "[DELHIVERY] tenant=%s operation=%s status=%s path=%s",
                            tenant_id,
                            method,
                            exc.code,
                            path,
                        )
                        raise DelhiveryError(
                            "Delhivery rejected the API token. "
                            "If you are on staging, use a staging token "
                            "(live portal tokens need the production base URL).",
                            code="AUTH_FAILED",
                            status_code=400,
                        ) from exc
                    if exc.code == 429:
                        raise DelhiveryError(
                            "Delhivery rate limit exceeded. Try again shortly.",
                            code="RATE_LIMIT",
                            status_code=429,
                        ) from exc
                    detail = _safe_error_detail_text(body, exc.code)
                    logger.warning(
                        "[DELHIVERY] tenant=%s operation=%s status=%s path=%s",
                        tenant_id,
                        method,
                        exc.code,
                        path,
                    )
                    raise DelhiveryError(
                        detail or "Delhivery request failed.",
                        code="PROVIDER_ERROR",
                        status_code=400,
                    ) from exc
                except urllib_error.URLError as exc:
                    reason = str(getattr(exc, "reason", exc))
                    last_error = exc
                    if "CERTIFICATE" in reason.upper() or "SSL" in reason.upper():
                        logger.warning(
                            "[DELHIVERY] tenant=%s operation=%s status=ssl_retry path=%s",
                            tenant_id,
                            method,
                            path,
                        )
                        break
                    if attempt <= retries:
                        time.sleep(0.4 * attempt)
                        continue
                    logger.warning(
                        "[DELHIVERY] tenant=%s operation=%s status=network path=%s",
                        tenant_id,
                        method,
                        path,
                    )
                    raise DelhiveryError(
                        "Could not reach Delhivery.",
                        code="NETWORK",
                        status_code=502,
                    ) from exc
                except TimeoutError as exc:
                    last_error = exc
                    if attempt <= retries:
                        time.sleep(0.4 * attempt)
                        continue
                    raise DelhiveryError(
                        "Delhivery request timed out.",
                        code="TIMEOUT",
                        status_code=504,
                    ) from exc

        logger.warning(
            "[DELHIVERY] tenant=%s operation=%s status=ssl path=%s",
            tenant_id,
            method,
            path,
        )
        raise DelhiveryError(
            "Could not reach Delhivery (SSL certificate error on this machine).",
            code="SSL_ERROR",
            status_code=502,
        ) from last_error

    def calculate_shipping_cost(
        self,
        tenant_id: str,
        *,
        origin_pin: str,
        destination_pin: str,
        weight_grams: int,
        payment_mode: str = "Prepaid",
        mode: str = "S",
    ) -> dict:
        o_pin = _validate_pincode(origin_pin)
        d_pin = _validate_pincode(destination_pin)
        weight = max(int(weight_grams or DEFAULT_WEIGHT_GRAMS), 50)
        md = "E" if str(mode).upper() in {"E", "EXPRESS"} else "S"
        pt = "COD" if str(payment_mode).upper() == "COD" else "Pre-paid"
        raw = self._request(
            "GET",
            "/api/kinko/v1/invoice/charges/.json",
            tenant_id=tenant_id,
            params={
                "md": md,
                "ss": "Delivered",
                "d_pin": d_pin,
                "o_pin": o_pin,
                "cgm": weight,
                "pt": pt,
            },
        )
        charge = _extract_charge_amount(raw)
        return {
            "mode": "Express" if md == "E" else "Surface",
            "modeCode": md,
            "shippingCost": charge,
            "originPin": o_pin,
            "destinationPin": d_pin,
            "weightGrams": weight,
            "paymentMode": "COD" if pt == "COD" else "Prepaid",
        }

    def get_checkout_rate_options(
        self,
        tenant_id: str,
        *,
        origin_pin: str,
        destination_pin: str,
        weight_grams: int = DEFAULT_WEIGHT_GRAMS,
        payment_mode: str = "Prepaid",
    ) -> list[dict]:
        options: list[dict] = []
        for mode_code, delivery_id, label, days in (
            ("S", "standard", "Surface", 4),
            ("E", "express", "Express", 2),
        ):
            try:
                quote = self.calculate_shipping_cost(
                    tenant_id,
                    origin_pin=origin_pin,
                    destination_pin=destination_pin,
                    weight_grams=weight_grams,
                    payment_mode=payment_mode,
                    mode=mode_code,
                )
                options.append(
                    {
                        "id": delivery_id,
                        "mode": label,
                        "estimatedDays": days,
                        "shippingCost": quote["shippingCost"],
                    }
                )
            except DelhiveryError:
                logger.warning(
                    "[DELHIVERY] tenant=%s operation=rate status=failed mode=%s",
                    tenant_id,
                    mode_code,
                )
        return options

    def create_forward_shipment(
        self,
        tenant_id: str,
        *,
        pickup_location_name: str,
        order_id: str,
        consignee_name: str,
        consignee_phone: str,
        address: str,
        city: str,
        state: str,
        pincode: str,
        country: str,
        payment_mode: str,
        total_amount: float,
        cod_amount: float,
        products_description: str,
        weight_grams: int = DEFAULT_WEIGHT_GRAMS,
        length_cm: float = 10,
        breadth_cm: float = 10,
        height_cm: float = 10,
    ) -> dict:
        pin = _validate_pincode(pincode)
        phone = "".join(ch for ch in str(consignee_phone or "") if ch.isdigit())[-10:]
        if len(phone) < 10:
            raise DelhiveryError(
                "Consignee phone must be a valid 10-digit number.",
                code="INVALID_PHONE",
                status_code=400,
            )
        pay = "COD" if str(payment_mode).upper() == "COD" else "Prepaid"
        shipment = {
            "name": str(consignee_name or "Customer")[:100],
            "add": str(address or "")[:350],
            "pin": pin,
            "city": str(city or "")[:80],
            "state": str(state or "")[:80],
            "country": str(country or "India")[:40] or "India",
            "phone": phone,
            "order": str(order_id)[:50],
            "payment_mode": pay,
            "cod_amount": float(cod_amount or 0) if pay == "COD" else 0,
            "total_amount": float(total_amount or 0),
            "products_desc": str(products_description or "Retail goods")[:200],
            "weight": max(int(weight_grams or DEFAULT_WEIGHT_GRAMS), 50),
            "shipment_length": float(length_cm or 10),
            "shipment_width": float(breadth_cm or 10),
            "shipment_height": float(height_cm or 10),
            "hsn_code": DEFAULT_HSN,
        }
        payload = {
            "shipments": [shipment],
            "pickup_location": {"name": str(pickup_location_name or "").strip()},
        }
        raw = self._request(
            "POST",
            "/api/cmu/create.json",
            tenant_id=tenant_id,
            form_body={
                "format": "json",
                "data": json.dumps(payload),
            },
        )
        package = _first_package(raw)
        waybill = (
            package.get("waybill")
            or package.get("wbn")
            or (raw.get("waybill") if isinstance(raw, dict) else None)
        )
        if not waybill:
            remark = package.get("remarks") or package.get("status") or raw
            raise DelhiveryError(
                f"Shipment not created: {remark}",
                code="SHIPMENT_FAILED",
                status_code=400,
            )
        waybill = str(waybill)
        logger.info(
            "[DELHIVERY] tenant=%s order=%s operation=create_shipment status=success awb=%s",
            tenant_id,
            order_id,
            waybill,
        )
        return {
            "waybill": waybill,
            "trackingUrl": TRACKING_URL_TEMPLATE.format(waybill=waybill),
            "remarks": package.get("remarks") or package.get("status"),
        }

    def track_shipment(self, tenant_id: str, waybill: str) -> dict:
        wbn = str(waybill or "").strip()
        if not wbn:
            raise DelhiveryError(
                "Waybill is required.",
                code="INVALID_AWB",
                status_code=400,
            )
        raw = self._request(
            "GET",
            "/api/v1/packages/json/",
            tenant_id=tenant_id,
            params={"waybill": wbn},
        )
        shipment = None
        if isinstance(raw, dict):
            shipment_data = raw.get("ShipmentData") or raw.get("shipment_data")
            if isinstance(shipment_data, list) and shipment_data:
                first = shipment_data[0]
                shipment = first.get("Shipment") if isinstance(first, dict) else None
        status_label = None
        status_type = None
        status_date = None
        location = None
        history: list = []
        if isinstance(shipment, dict):
            status = shipment.get("Status") if isinstance(shipment.get("Status"), dict) else {}
            status_label = status.get("Status") or shipment.get("Status")
            status_type = status.get("StatusType")
            status_date = status.get("StatusDateTime") or status.get("StatusDate")
            location = status.get("StatusLocation") or status.get("Instructions")
            scans = shipment.get("Scans") or shipment.get("ScanDetail") or []
            if isinstance(scans, list):
                history = scans[:20]
        return {
            "awb": wbn,
            "status": status_label,
            "statusCode": status_type,
            "location": location,
            "estimatedDelivery": status_date,
            "trackingUrl": TRACKING_URL_TEMPLATE.format(waybill=wbn),
            "history": history,
        }

    def packing_slip_url(self, waybill: str) -> str:
        wbn = str(waybill or "").strip()
        return f"{self.base_url}/api/p/packing_slip?wbns={parse.quote(wbn)}"

    def create_pickup_request(
        self,
        tenant_id: str,
        *,
        pickup_location: str,
        pickup_date: str,
        pickup_time: str,
        expected_package_count: int,
    ) -> dict:
        location = str(pickup_location or "").strip()
        if not location:
            raise DelhiveryError(
                "Pickup location name is required.",
                code="PICKUP_LOCATION_REQUIRED",
                status_code=400,
            )
        count = max(1, min(int(expected_package_count or 1), 500))
        body = {
            "pickup_location": location,
            "pickup_date": pickup_date,
            "pickup_time": pickup_time,
            "expected_package_count": count,
        }
        raw = self._request(
            "POST",
            "/fm/request/new/",
            tenant_id=tenant_id,
            json_body=body,
        )
        pickup_id = None
        if isinstance(raw, dict):
            pickup_id = (
                raw.get("pickup_id")
                or raw.get("pickupId")
                or (raw.get("data") or {}).get("pickup_id")
                if isinstance(raw.get("data"), dict)
                else None
            )
        logger.info(
            "[DELHIVERY] tenant=%s operation=pickup_request status=success pickup_id=%s count=%s",
            tenant_id,
            pickup_id,
            count,
        )
        return {
            "success": True,
            "pickupId": str(pickup_id) if pickup_id else None,
            "pickupLocation": location,
            "pickupDate": pickup_date,
            "pickupTime": pickup_time,
            "expectedPackageCount": count,
            "raw": raw if isinstance(raw, dict) else {"raw": raw},
        }

    def test_connection(self, tenant_id: str, pincode: str = "110001") -> dict:
        result = self.check_small_parcel_serviceability(tenant_id, pincode)
        logger.info(
            "[DELHIVERY] tenant=%s operation=test_connection status=success pincode=%s",
            tenant_id,
            pincode,
        )
        return result

    def check_small_parcel_serviceability(self, tenant_id: str, pincode: str) -> dict:
        pin = _validate_pincode(pincode)
        raw = self._request(
            "GET",
            "/c/api/pin-codes/json/",
            tenant_id=tenant_id,
            params={"filter_codes": pin},
        )
        delivery_codes = raw.get("delivery_codes") if isinstance(raw, dict) else None
        if not isinstance(delivery_codes, list) or not delivery_codes:
            return {
                "success": True,
                "pincode": pin,
                "serviceable": False,
                "cod": False,
                "prepaid": False,
                "reversePickup": False,
            }

        first = delivery_codes[0] if isinstance(delivery_codes[0], dict) else {}
        postal = first.get("postal_code") if isinstance(first.get("postal_code"), dict) else first
        if not isinstance(postal, dict):
            postal = {}

        cod = _truthy(
            postal.get("cod")
            or postal.get("is_cod")
            or postal.get("is_cod_available")
        )
        prepaid = _truthy(
            postal.get("pre_paid")
            or postal.get("prepaid")
            or postal.get("is_prepaid_available")
            or True
        )
        reverse_pickup = _truthy(
            postal.get("pickup")
            or postal.get("reverse_pickup")
            or postal.get("is_reverse_pickup_available")
        )
        return {
            "success": True,
            "pincode": pin,
            "serviceable": True,
            "cod": cod,
            "prepaid": prepaid,
            "reversePickup": reverse_pickup,
            "city": postal.get("city") or postal.get("district"),
            "state": postal.get("state_code") or postal.get("state"),
        }

    def check_heavy_serviceability(self, tenant_id: str, pincode: str) -> dict:
        pin = _validate_pincode(pincode)
        raw = self._request(
            "GET",
            "/api/dc/fetch/serviceability/pincode",
            tenant_id=tenant_id,
            params={"pincode": pin, "product_type": "Heavy"},
        )
        return {
            "success": True,
            "pincode": pin,
            "productType": "Heavy",
            "data": raw if isinstance(raw, dict) else {"raw": raw},
        }

    def create_warehouse(self, tenant_id: str, payload: dict) -> dict:
        body = {
            "name": str(payload.get("name") or "").strip()[:80],
            "email": str(payload.get("email") or "").strip()[:120],
            "phone": str(payload.get("phone") or "").strip()[:20],
            "address": str(payload.get("address") or "").strip()[:350],
            "city": str(payload.get("city") or "").strip()[:80],
            "country": str(payload.get("country") or "India").strip()[:80] or "India",
            "pin": _validate_pincode(str(payload.get("pin") or "")),
            "return_address": str(
                payload.get("return_address") or payload.get("address") or ""
            ).strip()[:350],
            "return_pin": _validate_pincode(
                str(payload.get("return_pin") or payload.get("pin") or "")
            ),
            "return_city": str(
                payload.get("return_city") or payload.get("city") or ""
            ).strip()[:80],
            "return_state": str(payload.get("return_state") or "").strip()[:80],
            "return_country": str(
                payload.get("return_country") or payload.get("country") or "India"
            ).strip()[:80]
            or "India",
        }
        raw = self._request(
            "POST",
            "/api/backend/clientwarehouse/create/",
            tenant_id=tenant_id,
            json_body=body,
        )
        logger.info(
            "[DELHIVERY] tenant=%s operation=create_warehouse status=success name=%s",
            tenant_id,
            body["name"],
        )
        data = raw.get("data") if isinstance(raw, dict) and isinstance(raw.get("data"), dict) else {}
        provider_name = (
            (data.get("name") if isinstance(data, dict) else None)
            or body["name"]
        )
        return {
            "success": True,
            "name": str(provider_name),
            "pin": body["pin"],
            "city": body["city"],
            "phone": body["phone"],
            "rawMessage": (
                data.get("message")
                if isinstance(data, dict)
                else (raw.get("message") if isinstance(raw, dict) else None)
            ),
            "providerPayload": data or (raw if isinstance(raw, dict) else {}),
        }

    def fetch_waybills(self, tenant_id: str, count: int = 30) -> dict:
        safe_count = max(1, min(int(count or 1), 50))
        raw = self._request(
            "GET",
            "/waybill/api/bulk/json/",
            tenant_id=tenant_id,
            params={"count": f"{safe_count:04d}"},
        )
        waybills: list[str] = []
        if isinstance(raw, dict):
            for key in ("waybills", "wbns", "WBNS", "packages"):
                value = raw.get(key)
                if isinstance(value, list):
                    waybills = [str(item) for item in value if item]
                    break
                if isinstance(value, str) and value.strip():
                    waybills = [part.strip() for part in value.split(",") if part.strip()]
                    break
            if not waybills and raw.get("waybill"):
                waybills = [str(raw["waybill"])]
        return {"success": True, "count": len(waybills), "waybills": waybills}


def _validate_pincode(pincode: str) -> str:
    pin = "".join(ch for ch in str(pincode or "") if ch.isdigit())
    if len(pin) != 6:
        raise DelhiveryError(
            "Pincode must be exactly 6 digits.",
            code="INVALID_PINCODE",
            status_code=400,
        )
    return pin


def _extract_charge_amount(raw: Any) -> float:
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if not isinstance(raw, dict):
        raise DelhiveryError(
            "Unable to read shipping charges from Delhivery.",
            code="RATE_PARSE_FAILED",
            status_code=502,
        )
    for key in ("total_amount", "total_amt", "gross_amount", "amount", "charge_DL"):
        if raw.get(key) is not None:
            try:
                return round(float(raw[key]), 2)
            except (TypeError, ValueError):
                continue
    raise DelhiveryError(
        "Unable to read shipping charges from Delhivery.",
        code="RATE_PARSE_FAILED",
        status_code=502,
    )


def _first_package(raw: Any) -> dict:
    packages = []
    if isinstance(raw, dict):
        packages = raw.get("packages") or raw.get("Package") or []
        if not packages and isinstance(raw.get("data"), dict):
            packages = raw["data"].get("packages") or []
    package = packages[0] if isinstance(packages, list) and packages else {}
    return package if isinstance(package, dict) else {}


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y", "ok"}


def _safe_error_detail_text(body: str, status_code: int) -> str:
    text = (body or "").strip()
    if not text:
        return f"HTTP {status_code}"
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text[:300]
    if isinstance(payload, dict):
        prepaid = payload.get("prepaid")
        if prepaid:
            return str(prepaid)[:300]
        for key in ("message", "Error", "error", "detail", "rmk", "remarks"):
            if payload.get(key):
                return str(payload[key])[:300]
        # Fall back to compact JSON for small provider payloads
        compact = json.dumps(payload, ensure_ascii=True)
        if len(compact) <= 300:
            return compact
    return text[:300]
