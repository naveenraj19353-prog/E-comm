"""Delhivery One HTTP client — tenant token never leaves the server."""

from __future__ import annotations

import base64
import html
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
from app.services.shipping_partner_config import (
    ShippingConfigError,
    get_operation,
    get_partner_spec,
    partner_base_url,
)
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


def get_delhivery_headers(tenant_id: str, provider: str = PROVIDER) -> dict[str, str]:
    token = get_tenant_api_token(tenant_id, provider)
    try:
        spec = get_partner_spec(provider)
        auth = spec.get("auth") if isinstance(spec.get("auth"), dict) else {}
        header = str(auth.get("header") or "Authorization")
        value = str(auth.get("value") or "Token {apiToken}").replace("{apiToken}", token)
    except ShippingConfigError:
        header = "Authorization"
        value = f"Token {token}"
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        header: value,
    }


def get_tenant_api_token(tenant_id: str, provider: str = PROVIDER) -> str:
    scoped = str(tenant_id or "").strip().lower()
    doc = shipping_integrations.find_one(
        {"tenantId": scoped, "provider": str(provider or PROVIDER).strip().lower()},
        {"apiTokenEncrypted": 1, "enabled": 1},
    )
    if not doc or not doc.get("apiTokenEncrypted"):
        raise DelhiveryError(
            "Delivery partner is not connected for this store.",
            code="NOT_CONNECTED",
            status_code=400,
        )
    return decrypt_secret(str(doc["apiTokenEncrypted"]))


class DelhiveryService:
    def __init__(
        self,
        base_url: str | None = None,
        timeout: int = 45,
        provider: str = PROVIDER,
    ):
        self.provider = str(provider or PROVIDER).strip().lower()
        self.timeout = timeout
        try:
            self.base_url = (base_url or partner_base_url(self.provider)).rstrip("/")
        except ShippingConfigError:
            self.base_url = (base_url or DELHIVERY_BASE_URL).rstrip("/")

    def _operation_path(self, name: str, fallback: str) -> str:
        try:
            return str(get_operation(self.provider, name)["path"])
        except ShippingConfigError:
            return fallback

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
        headers = get_delhivery_headers(tenant_id, self.provider)
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

    def get_checkout_rate_options(
        self,
        tenant_id: str,
        *,
        origin_pin: str,
        destination_pin: str,
        weight_grams: int = DEFAULT_WEIGHT_GRAMS,
        payment_mode: str = "Prepaid",
    ) -> list[dict]:
        from app.services.shipping_adapter import ConfigPartnerService

        return ConfigPartnerService(self.provider).get_checkout_rate_options(
            tenant_id,
            origin_pin=origin_pin,
            destination_pin=destination_pin,
            weight_grams=weight_grams,
            payment_mode=payment_mode,
        )

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
            self._operation_path("createShipment", "/api/cmu/create.json"),
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

    def create_reverse_shipment(
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
        return_name: str,
        return_address: str,
        return_city: str,
        return_state: str,
        return_pincode: str,
        return_phone: str,
        products_description: str,
        weight_grams: int = DEFAULT_WEIGHT_GRAMS,
    ) -> dict:
        pin = _validate_pincode(pincode)
        return_pin = _validate_pincode(return_pincode)
        phone = "".join(ch for ch in str(consignee_phone or "") if ch.isdigit())[-10:]
        warehouse_phone = "".join(ch for ch in str(return_phone or "") if ch.isdigit())[-10:]
        if len(phone) < 10:
            raise DelhiveryError(
                "Customer phone must be a valid 10-digit number.",
                code="INVALID_PHONE",
                status_code=400,
            )
        shipment = {
            "name": str(consignee_name or "Customer")[:100],
            "add": str(address or "")[:350],
            "pin": pin,
            "city": str(city or "")[:80],
            "state": str(state or "")[:80],
            "country": str(country or "India")[:40] or "India",
            "phone": phone,
            "order": f"{str(order_id)[:45]}-R",
            "payment_mode": "Pickup",
            "order_type": "Reverse",
            "cod_amount": 0,
            "total_amount": 0,
            "products_desc": str(products_description or "Return goods")[:200],
            "weight": max(int(weight_grams or DEFAULT_WEIGHT_GRAMS), 50),
            "return_name": str(return_name or pickup_location_name)[:100],
            "return_add": str(return_address or "")[:350],
            "return_city": str(return_city or "")[:80],
            "return_state": str(return_state or "")[:80],
            "return_pin": return_pin,
            "return_phone": warehouse_phone or phone,
        }
        payload = {
            "shipments": [shipment],
            "pickup_location": {"name": str(pickup_location_name or "").strip()},
        }
        raw = self._request(
            "POST",
            self._operation_path("createShipment", "/api/cmu/create.json"),
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
                f"Reverse shipment not created: {remark}",
                code="REVERSE_SHIPMENT_FAILED",
                status_code=400,
            )
        waybill = str(waybill)
        logger.info(
            "[DELHIVERY] tenant=%s order=%s operation=create_reverse status=success awb=%s",
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
            self._operation_path("track", "/api/v1/packages/json/"),
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
        history: list[dict] = []
        if isinstance(shipment, dict):
            status = shipment.get("Status") if isinstance(shipment.get("Status"), dict) else {}
            status_label = status.get("Status") or shipment.get("Status")
            status_type = status.get("StatusType")
            status_date = status.get("StatusDateTime") or status.get("StatusDate")
            location = status.get("StatusLocation") or status.get("Instructions")
            scans = shipment.get("Scans") or shipment.get("ScanDetail") or []
            if isinstance(scans, list):
                for item in scans[:30]:
                    detail = (
                        item.get("ScanDetail")
                        if isinstance(item, dict) and isinstance(item.get("ScanDetail"), dict)
                        else item
                    )
                    if not isinstance(detail, dict):
                        continue
                    history.append(
                        {
                            "status": str(
                                detail.get("Scan")
                                or detail.get("Status")
                                or detail.get("Instructions")
                                or ""
                            ).strip(),
                            "location": str(
                                detail.get("ScannedLocation")
                                or detail.get("StatusLocation")
                                or detail.get("City")
                                or ""
                            ).strip(),
                            "at": str(
                                detail.get("ScanDateTime")
                                or detail.get("StatusDateTime")
                                or ""
                            ).strip(),
                        }
                    )
        return {
            "awb": wbn,
            "status": status_label,
            "statusCode": status_type,
            "location": location,
            "estimatedDelivery": status_date,
            "trackingUrl": TRACKING_URL_TEMPLATE.format(waybill=wbn),
            "history": [event for event in history if event.get("status") or event.get("location")],
        }

    def packing_slip_url(self, waybill: str) -> str:
        wbn = str(waybill or "").strip()
        return f"{self.base_url}{self._operation_path('label', '/api/p/packing_slip')}?wbns={parse.quote(wbn)}"

    def fetch_packing_slip(
        self,
        tenant_id: str,
        waybill: str,
        fallback: dict | None = None,
    ) -> tuple[bytes, str]:
        wbn = str(waybill or "").strip()
        if not wbn:
            raise DelhiveryError(
                "Waybill is required.",
                code="INVALID_AWB",
                status_code=400,
            )
        path = self._operation_path("label", "/api/p/packing_slip")
        headers = get_delhivery_headers(tenant_id, self.provider)
        headers.pop("Content-Type", None)
        headers["Accept"] = "application/pdf, application/json, text/html;q=0.8, */*;q=0.5"
        last_error: Exception | None = None
        last_body: bytes | None = None
        for params in ({"wbns": wbn}, {"wbns": wbn, "pdf": "true"}):
            url = self._url(path, params)
            try:
                body, content_type = self._http_get(url, headers)
            except DelhiveryError as error:
                last_error = error
                if error.code == "AUTH_FAILED":
                    raise
                continue
            last_body = body
            parsed = self._parse_packing_slip(
                body,
                content_type,
                waybill=wbn,
                fallback=fallback,
                headers=headers,
            )
            if parsed:
                return parsed
        if last_body is not None:
            html_body = render_packing_slip_html(wbn, fallback or {"wbn": wbn})
            return html_body.encode("utf-8"), "text/html; charset=utf-8"
        if last_error:
            raise last_error
        raise DelhiveryError(
            "Unable to download packing slip.",
            code="LABEL_FAILED",
            status_code=400,
        )

    def _http_get(self, url: str, headers: dict[str, str]) -> tuple[bytes, str]:
        last_error: Exception | None = None
        for ctx in _ssl_contexts():
            req = request.Request(url, headers=headers, method="GET")
            try:
                with request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                    return response.read(), str(response.headers.get("Content-Type") or "")
            except urllib_error.HTTPError as exc:
                payload = exc.read()
                if exc.code in {401, 403}:
                    raise DelhiveryError(
                        "Delhivery rejected the API token for packing slip.",
                        code="AUTH_FAILED",
                        status_code=400,
                    ) from exc
                detail = _safe_error_detail_text(
                    payload.decode("utf-8", errors="replace"),
                    exc.code,
                )
                raise DelhiveryError(
                    detail or "Unable to download packing slip.",
                    code="LABEL_FAILED",
                    status_code=400,
                ) from exc
            except urllib_error.URLError as exc:
                last_error = exc
                reason = str(getattr(exc, "reason", exc))
                if "CERTIFICATE" in reason.upper() or "SSL" in reason.upper():
                    continue
                raise DelhiveryError(
                    "Could not reach Delhivery.",
                    code="NETWORK",
                    status_code=502,
                ) from exc
        raise DelhiveryError(
            "Could not reach Delhivery (SSL certificate error on this machine).",
            code="SSL_ERROR",
            status_code=502,
        ) from last_error

    def _parse_packing_slip(
        self,
        body: bytes,
        content_type: str,
        *,
        waybill: str,
        fallback: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[bytes, str] | None:
        lowered = content_type.lower()
        if body[:4] == b"%PDF" or ("pdf" in lowered and "json" not in lowered and body[:1] != b"{"):
            return body, "application/pdf"
        if "html" in lowered and body.lstrip()[:1] in {b"<", b"\xef"}:
            return body, "text/html; charset=utf-8"
        text = body.decode("utf-8", errors="replace").strip()
        if not text:
            return None
        if text.lstrip().startswith("<"):
            return body, "text/html; charset=utf-8"
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return body, content_type or "application/octet-stream"
        if isinstance(payload, dict) and payload.get("success") is False:
            raise DelhiveryError(
                str(payload.get("error") or payload.get("message") or payload),
                code="LABEL_FAILED",
                status_code=400,
            )
        first: dict[str, Any] = {}
        if isinstance(payload, dict):
            packages = payload.get("packages")
            if isinstance(packages, list) and packages and isinstance(packages[0], dict):
                first = packages[0]
            elif not packages:
                first = {k: v for k, v in payload.items() if k not in {"packages", "packages_found"}}
        elif isinstance(payload, list) and payload and isinstance(payload[0], dict):
            first = payload[0]
        merged = {**(fallback or {}), **{k: v for k, v in first.items() if v not in (None, "")}}
        merged.setdefault("wbn", waybill)

        pdf_b64 = (
            first.get("pdf")
            or first.get("pdf_data")
            or first.get("label")
            or first.get("packing_slip")
        )
        if isinstance(pdf_b64, str) and pdf_b64.strip() and not pdf_b64.strip().lower().startswith("http"):
            try:
                decoded = base64.b64decode(pdf_b64)
            except Exception as error:
                raise DelhiveryError(
                    "Packing slip could not be decoded.",
                    code="LABEL_FAILED",
                    status_code=502,
                ) from error
            if decoded[:4] == b"%PDF":
                return decoded, "application/pdf"
            if decoded.lstrip()[:1] == b"<":
                return decoded, "text/html; charset=utf-8"

        link = (
            first.get("pdf_download_link")
            or first.get("pdf_url")
            or first.get("label_url")
            or pdf_b64
        )
        if isinstance(link, str) and link.strip().lower().startswith("http") and headers:
            try:
                linked, linked_ct = self._http_get(link.strip(), headers)
            except DelhiveryError:
                linked, linked_ct = b"", ""
            if linked[:4] == b"%PDF":
                return linked, "application/pdf"
            if linked and "html" in linked_ct.lower():
                return linked, "text/html; charset=utf-8"

        if isinstance(payload, dict):
            packages = payload.get("packages")
            if isinstance(packages, list) and not packages:
                has_pkg = any(
                    str(first.get(key) or "").strip()
                    for key in ("pdf", "pdf_download_link", "wbn", "oid", "cn", "add")
                )
                if not has_pkg:
                    return None

        html_body = render_packing_slip_html(waybill, merged)
        return html_body.encode("utf-8"), "text/html; charset=utf-8"

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
            self._operation_path("pickup", "/fm/request/new/"),
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
        from app.services.shipping_adapter import ConfigPartnerService

        return ConfigPartnerService(self.provider).check_serviceability(
            tenant_id, pincode
        )

    def check_heavy_serviceability(self, tenant_id: str, pincode: str) -> dict:
        pin = _validate_pincode(pincode)
        raw = self._request(
            "GET",
            self._operation_path(
                "serviceabilityHeavy", "/api/dc/fetch/serviceability/pincode"
            ),
            tenant_id=tenant_id,
            params={"pincode": pin, "product_type": "Heavy"},
        )
        return {
            "success": True,
            "pincode": pin,
            "productType": "Heavy",
            "data": raw if isinstance(raw, dict) else {"raw": raw},
        }

    def create_warehouse(self, tenant_id: str, payload: dict, *, update: bool = False) -> dict:
        state = str(
            payload.get("state") or payload.get("return_state") or ""
        ).strip()[:80]
        body = {
            "name": str(payload.get("name") or "").strip()[:80],
            "email": str(payload.get("email") or "").strip()[:120],
            "phone": str(payload.get("phone") or "").strip()[:20],
            "address": str(payload.get("address") or "").strip()[:350],
            "city": str(payload.get("city") or "").strip()[:80],
            "state": state,
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
            "return_state": str(
                payload.get("return_state") or state
            ).strip()[:80],
            "return_country": str(
                payload.get("return_country") or payload.get("country") or "India"
            ).strip()[:80]
            or "India",
        }
        if not body["state"] or not body["return_state"]:
            raise DelhiveryError(
                "Pickup location must include state.",
                code="INVALID_ADDRESS",
                status_code=400,
            )
        create_path = self._operation_path("warehouse", "/api/backend/clientwarehouse/create/")
        edit_path = self._operation_path("warehouseEdit", "/api/backend/clientwarehouse/edit/")
        path = edit_path if update else create_path
        try:
            raw = self._request(
                "POST",
                path,
                tenant_id=tenant_id,
                json_body=body,
            )
        except DelhiveryError as error:
            if update or "exist" not in str(error).lower():
                raise
            raw = self._request(
                "POST",
                edit_path,
                tenant_id=tenant_id,
                json_body=body,
            )
        if isinstance(raw, dict) and raw.get("success") is False:
            message = str(raw.get("error") or raw.get("message") or raw)
            if not update and "exist" in message.lower():
                raw = self._request(
                    "POST",
                    edit_path,
                    tenant_id=tenant_id,
                    json_body=body,
                )
            else:
                raise DelhiveryError(
                    message,
                    code="WAREHOUSE_FAILED",
                    status_code=400,
                )
        logger.info(
            "[DELHIVERY] tenant=%s operation=%s status=success name=%s",
            tenant_id,
            "edit_warehouse" if update else "create_warehouse",
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
            self._operation_path("waybills", "/waybill/api/bulk/json/"),
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


def _first_package(raw: Any) -> dict:
    packages = []
    if isinstance(raw, dict):
        packages = raw.get("packages") or raw.get("Package") or []
        if not packages and isinstance(raw.get("data"), dict):
            packages = raw["data"].get("packages") or []
    package = packages[0] if isinstance(packages, list) and packages else {}
    return package if isinstance(package, dict) else {}


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


_CODE128_PATTERNS = (
    "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
    "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
    "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
    "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
    "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
    "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
    "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
    "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
    "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
    "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
    "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
    "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
    "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
    "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
    "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
    "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
    "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
    "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
    "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
    "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
    "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
    "11010011100", "1100011101011",
)


def _code128_svg(text: str) -> str:
    payload = "".join(ch for ch in str(text or "") if 32 <= ord(ch) <= 126)[:32]
    if not payload:
        return ""
    checksum = 104
    codes = [104]
    for index, char in enumerate(payload):
        value = ord(char) - 32
        codes.append(value)
        checksum += value * (index + 1)
    codes.append(checksum % 103)
    codes.append(106)
    bits = "".join(_CODE128_PATTERNS[code] for code in codes)
    width = max(len(bits), 1)
    bars = []
    x = 0
    while x < width:
        if bits[x] != "1":
            x += 1
            continue
        run = 1
        while x + run < width and bits[x + run] == "1":
            run += 1
        bars.append(f'<rect x="{x}" y="0" width="{run}" height="40"/>')
        x += run
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 40" '
        f'preserveAspectRatio="none" role="img" aria-label="{html.escape(payload)}">'
        f'<g fill="#111">{"".join(bars)}</g></svg>'
    )


def _slip_text(pkg: dict, *keys: str) -> str:
    for key in keys:
        value = pkg.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def render_packing_slip_html(waybill: str, pkg: dict | None = None) -> str:
    data = pkg if isinstance(pkg, dict) else {}
    awb = _slip_text(data, "wbn", "waybill", "wbns") or str(waybill or "").strip()
    order_id = _slip_text(data, "oid", "order", "order_id", "cl_ref")
    consignee = _slip_text(data, "cn", "name", "consignee")
    address = _slip_text(data, "add", "address", "ad")
    pin = _slip_text(data, "pin", "pincode", "postalCode")
    city = _slip_text(data, "cty", "city")
    state = _slip_text(data, "st", "state")
    phone = _slip_text(data, "ph", "phone")
    pay = _slip_text(data, "pt", "payment", "payment_mode") or "Prepaid"
    products = _slip_text(data, "prd", "products_desc", "product")
    client = _slip_text(data, "cl", "client")
    sort_code = _slip_text(data, "si", "sort_code", "sort")
    try:
        cod = float(data.get("cod") or 0)
    except (TypeError, ValueError):
        cod = 0.0
    try:
        amount = float(data.get("rs") or data.get("total") or 0)
    except (TypeError, ValueError):
        amount = 0.0
    locality = ", ".join(part for part in [city, state] if part)
    if pin:
        locality = f"{locality} - {pin}" if locality else pin
    barcode = _code128_svg(awb)
    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>Packing slip {html.escape(awb)}</title>
<style>
  body {{ font-family: Arial, Helvetica, sans-serif; color: #111; margin: 16px; }}
  .slip {{ width: 380px; border: 2px solid #111; padding: 12px; }}
  h1 {{ font-size: 14px; margin: 0 0 8px; letter-spacing: 0.08em; }}
  .awb {{ font-size: 22px; font-weight: 700; letter-spacing: 0.04em; margin: 8px 0 4px; }}
  .barcode {{ width: 100%; height: 52px; margin: 4px 0 10px; }}
  .barcode svg {{ width: 100%; height: 52px; display: block; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  td {{ vertical-align: top; padding: 3px 0; }}
  .k {{ width: 92px; color: #555; }}
  .pay {{ display: inline-block; border: 1px solid #111; padding: 2px 8px; font-weight: 700; }}
  @media print {{ body {{ margin: 0; }} .slip {{ border-width: 1px; }} }}
</style>
</head><body>
<div class="slip">
  <h1>DELHIVERY PACKING SLIP</h1>
  {f'<div>{html.escape(client)}</div>' if client else ''}
  <div class="barcode">{barcode}</div>
  <div class="awb">{html.escape(awb)}</div>
  <table>
    <tr><td class="k">Order</td><td>{html.escape(order_id or "—")}</td></tr>
    <tr><td class="k">Consignee</td><td>{html.escape(consignee or "—")}<br/>{html.escape(address)}<br/>{html.escape(locality)}<br/>{html.escape(phone)}</td></tr>
    <tr><td class="k">Contents</td><td>{html.escape(products or "Shipment")}</td></tr>
    <tr><td class="k">Payment</td><td><span class="pay">{html.escape(pay)}</span>
      {" COD ₹" + html.escape(f"{cod:.2f}") if pay.upper() == "COD" and cod else ""}
      {" · ₹" + html.escape(f"{amount:.2f}") if amount else ""}</td></tr>
    {f'<tr><td class="k">Sort</td><td>{html.escape(sort_code)}</td></tr>' if sort_code else ''}
  </table>
</div>
<script>window.addEventListener("load", function () {{ window.focus(); }});</script>
</body></html>"""

