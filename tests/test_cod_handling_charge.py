import unittest
from unittest.mock import MagicMock, patch

from app.services.cache import storefront_cache
from app.services.checkout_service import _cod_handling_charge, _partner_shipping


class CodHandlingChargeCalculationTests(unittest.TestCase):
    """`_cod_handling_charge` is pure: no mocking, just the arithmetic."""

    def test_cod_costs_more_than_prepaid_for_the_same_route(self):
        options_by_mode = {
            "Prepaid": [{"id": "standard", "shippingCost": 60.0}],
            "COD": [{"id": "standard", "shippingCost": 85.0}],
        }
        self.assertEqual(_cod_handling_charge(options_by_mode, "standard"), 25.0)

    def test_never_negative_even_if_cod_happens_to_quote_cheaper(self):
        options_by_mode = {
            "Prepaid": [{"id": "standard", "shippingCost": 90.0}],
            "COD": [{"id": "standard", "shippingCost": 85.0}],
        }
        self.assertEqual(_cod_handling_charge(options_by_mode, "standard"), 0.0)

    def test_none_when_either_mode_has_no_quote(self):
        options_by_mode = {
            "Prepaid": [{"id": "standard", "shippingCost": 60.0}],
            "COD": [],
        }
        self.assertIsNone(_cod_handling_charge(options_by_mode, "standard"))

    def test_matches_by_delivery_method_id(self):
        options_by_mode = {
            "Prepaid": [
                {"id": "standard", "shippingCost": 60.0},
                {"id": "express", "shippingCost": 120.0},
            ],
            "COD": [
                {"id": "standard", "shippingCost": 85.0},
                {"id": "express", "shippingCost": 150.0},
            ],
        }
        self.assertEqual(_cod_handling_charge(options_by_mode, "express"), 30.0)


class PartnerShippingCodQuoteTests(unittest.TestCase):
    def setUp(self):
        storefront_cache.clear()

    @patch("app.services.shipping_adapter.ConfigPartnerService")
    @patch(
        "app.services.shipping_context.get_active_shipping_context",
        return_value={"originPin": "560001", "provider": "delhivery"},
    )
    def test_selecting_cod_returns_the_cod_inclusive_fee_and_the_handling_delta(
        self, _ctx: MagicMock, service_cls: MagicMock
    ):
        instance = service_cls.return_value
        instance.provider = "delhivery"
        instance.check_serviceability.return_value = {"serviceable": True}

        def rate_options(_tenant_id, *, origin_pin, destination_pin, payment_mode):
            if payment_mode == "COD":
                return [{"id": "standard", "mode": "Surface", "shippingCost": 85.0}]
            return [{"id": "standard", "mode": "Surface", "shippingCost": 60.0}]

        instance.get_checkout_rate_options.side_effect = rate_options

        fee, options, meta = _partner_shipping(
            "shop-a",
            {"postalCode": "560002"},
            "standard",
            payment_method="cod",
        )
        self.assertEqual(fee, 85.0)
        self.assertEqual(meta["codHandlingCharge"], 25.0)

    @patch("app.services.shipping_adapter.ConfigPartnerService")
    @patch(
        "app.services.shipping_context.get_active_shipping_context",
        return_value={"originPin": "560001", "provider": "delhivery"},
    )
    def test_selecting_online_payment_still_reports_what_cod_would_cost_extra(
        self, _ctx: MagicMock, service_cls: MagicMock
    ):
        instance = service_cls.return_value
        instance.provider = "delhivery"
        instance.check_serviceability.return_value = {"serviceable": True}

        def rate_options(_tenant_id, *, origin_pin, destination_pin, payment_mode):
            if payment_mode == "COD":
                return [{"id": "standard", "mode": "Surface", "shippingCost": 85.0}]
            return [{"id": "standard", "mode": "Surface", "shippingCost": 60.0}]

        instance.get_checkout_rate_options.side_effect = rate_options

        fee, _options, meta = _partner_shipping(
            "shop-b",
            {"postalCode": "560003"},
            "standard",
            payment_method="upi",
        )
        # The customer pays the plain (prepaid) fee when not paying COD...
        self.assertEqual(fee, 60.0)
        # ...but we still know, and can show, what choosing COD would add.
        self.assertEqual(meta["codHandlingCharge"], 25.0)

    @patch("app.services.shipping_adapter.ConfigPartnerService")
    @patch(
        "app.services.shipping_context.get_active_shipping_context",
        return_value={"originPin": "560001", "provider": "delhivery"},
    )
    def test_repeated_calls_for_the_same_route_do_not_re_quote_the_partner(
        self, _ctx: MagicMock, service_cls: MagicMock
    ):
        instance = service_cls.return_value
        instance.provider = "delhivery"
        instance.check_serviceability.return_value = {"serviceable": True}
        instance.get_checkout_rate_options.return_value = [
            {"id": "standard", "mode": "Surface", "shippingCost": 60.0}
        ]

        for _ in range(3):
            _partner_shipping(
                "shop-c",
                {"postalCode": "560004"},
                "standard",
                payment_method="upi",
            )
        # One call per payment mode (selected + the other, for comparison),
        # cached after that regardless of how many previews are requested.
        self.assertEqual(instance.get_checkout_rate_options.call_count, 2)


if __name__ == "__main__":
    unittest.main()
