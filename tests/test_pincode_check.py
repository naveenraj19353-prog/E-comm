import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.routes.delhivery import public_pincode_check
from app.services.delhivery_service import DelhiveryError


class PincodeCheckTests(unittest.TestCase):
    @patch("app.routes.delhivery.get_active_shipping_context", return_value=None)
    @patch("app.routes.delhivery.tenants")
    def test_unconnected_store_does_not_fake_delivery(
        self, tenants: MagicMock, _ctx: MagicMock
    ):
        tenants.find_one.return_value = {"tenantId": "demo", "isActive": True}
        result = public_pincode_check("560001", "demo")
        self.assertFalse(result["serviceable"])
        self.assertFalse(result["connected"])
        self.assertEqual(result["shippingOptions"], [])
        self.assertIn("not connected", result["message"].lower())
        self.assertNotIn("3–5", result["message"])

    @patch("app.routes.delhivery.ConfigPartnerService")
    @patch(
        "app.routes.delhivery.get_active_shipping_context",
        return_value={"originPin": "560001", "provider": "delhivery"},
    )
    @patch("app.routes.delhivery.tenants")
    def test_delhivery_auth_failure_is_not_shown_as_available(
        self, tenants: MagicMock, _ctx: MagicMock, service: MagicMock
    ):
        tenants.find_one.return_value = {"tenantId": "demo", "isActive": True}
        service.return_value.check_serviceability.side_effect = DelhiveryError(
            "Delhivery rejected the API token.", code="AUTH_FAILED"
        )
        result = public_pincode_check("560001", "demo")
        self.assertFalse(result["serviceable"])
        self.assertIn("rejected", result["message"].lower())

    @patch("app.routes.delhivery.ConfigPartnerService")
    @patch(
        "app.routes.delhivery.get_active_shipping_context",
        return_value={"originPin": "560001", "provider": "delhivery"},
    )
    @patch("app.routes.delhivery.tenants")
    def test_connected_store_returns_partner_rates(
        self, tenants: MagicMock, _ctx: MagicMock, service: MagicMock
    ):
        tenants.find_one.return_value = {"tenantId": "demo", "isActive": True}
        instance = service.return_value
        instance.check_serviceability.return_value = {
            "serviceable": True,
            "cod": True,
            "prepaid": True,
            "city": "Bengaluru",
            "estimatedDays": 4,
        }
        instance.get_checkout_rate_options.return_value = [
            {
                "id": "standard",
                "mode": "Surface",
                "estimatedDays": 4,
                "shippingCost": 85.0,
            },
            {
                "id": "express",
                "mode": "Express",
                "estimatedDays": 2,
                "shippingCost": 142.0,
            },
        ]
        result = public_pincode_check("560001", "demo")
        self.assertTrue(result["serviceable"])
        self.assertTrue(result["connected"])
        self.assertEqual(len(result["shippingOptions"]), 2)
        self.assertEqual(result["shippingOptions"][0]["shippingCost"], 85.0)
        self.assertIn("₹85", result["message"])
        self.assertNotIn("3–5", result["message"])
        instance.get_checkout_rate_options.assert_called_once()

    @patch("app.routes.delhivery.tenants")
    def test_unknown_store_is_not_found(self, tenants: MagicMock):
        tenants.find_one.return_value = None
        with self.assertRaises(HTTPException) as context:
            public_pincode_check("560001", "missing")
        self.assertEqual(context.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
