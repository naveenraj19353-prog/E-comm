"""Run pincode + rate APIs from shipping_partners.json for the active partner."""

from __future__ import annotations

from typing import Any

from app.services.delhivery_service import DelhiveryError, DelhiveryService
from app.services.shipping_partner_config import (
    get_operation,
    get_partner_spec,
    interpolate_vars,
    map_response,
    partner_base_url,
)


class ConfigPartnerService:
    def __init__(self, provider: str):
        self.provider = str(provider or "").strip().lower()
        self.spec = get_partner_spec(self.provider)
        self.http = DelhiveryService(
            provider=self.provider,
            base_url=partner_base_url(self.provider),
        )

    def _call(self, operation_name: str, tenant_id: str, variables: dict[str, Any]) -> Any:
        operation = get_operation(self.provider, operation_name)
        method = str(operation.get("method") or "GET").upper()
        path = interpolate_vars(operation["path"], variables)
        query = interpolate_vars(operation.get("query") or {}, variables)
        json_payload = interpolate_vars(operation.get("json") or {}, variables)
        return self.http._request(
            method,
            path,
            tenant_id=tenant_id,
            params=query or None,
            json_body=json_payload or None,
        )

    def check_serviceability(self, tenant_id: str, pincode: str) -> dict:
        pin = "".join(ch for ch in str(pincode or "") if ch.isdigit())
        raw = self._call("pincode", tenant_id, {"pincode": pin})
        mapped = map_response(raw, get_operation(self.provider, "pincode").get("map"))
        if not mapped.get("serviceable"):
            return {
                "success": True,
                "pincode": pin,
                "serviceable": False,
                "cod": False,
                "prepaid": False,
                "reversePickup": False,
            }
        return {
            "success": True,
            "pincode": pin,
            "serviceable": True,
            "cod": bool(mapped.get("cod")),
            "prepaid": bool(mapped.get("prepaid") if mapped.get("prepaid") is not None else True),
            "reversePickup": bool(mapped.get("reversePickup")),
            "city": mapped.get("city"),
            "state": mapped.get("state"),
            "estimatedDays": mapped.get("estimatedDays"),
        }

    def get_checkout_rate_options(
        self,
        tenant_id: str,
        *,
        origin_pin: str,
        destination_pin: str,
        weight_grams: int | None = None,
        payment_mode: str = "Prepaid",
    ) -> list[dict]:
        defaults = self.spec.get("defaults") if isinstance(self.spec.get("defaults"), dict) else {}
        weight = int(weight_grams or defaults.get("weightGrams") or 500)
        payment_type = (
            "COD"
            if str(payment_mode).upper() == "COD"
            else str(defaults.get("paymentType") or "Pre-paid")
        )
        modes = self.spec.get("rateModes") if isinstance(self.spec.get("rateModes"), list) else []
        options: list[dict] = []
        rate_map = get_operation(self.provider, "rate").get("map")
        for mode in modes:
            if not isinstance(mode, dict):
                continue
            params = mode.get("params") if isinstance(mode.get("params"), dict) else {}
            variables = {
                "originPin": origin_pin,
                "destinationPin": destination_pin,
                "weightGrams": weight,
                "paymentType": payment_type,
                **params,
            }
            try:
                raw = self._call("rate", tenant_id, variables)
                mapped = map_response(raw, rate_map)
            except DelhiveryError:
                continue
            cost = mapped.get("shippingCost")
            if cost is None:
                continue
            options.append(
                {
                    "id": str(mode.get("id") or "standard"),
                    "mode": str(mode.get("mode") or "Standard"),
                    "estimatedDays": mapped.get("estimatedDays"),
                    "shippingCost": float(cost),
                }
            )
        return options
