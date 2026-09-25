"""Free delivery above the store's order value (REQ-087)."""

import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.models.tenant import UpdateTenant
from app.routes import tenant as tenant_routes
from app.services import checkout_service
from app.services.cache import storefront_cache
from app.services.checkout_service import _free_delivery_options, _partner_shipping
from tests.mongo_fakes import FakeCollection

PREPAID = [
    {"id": "standard", "mode": "Surface", "shippingCost": 60.0},
    {"id": "express", "mode": "Express", "shippingCost": 120.0},
]
COD = [
    {"id": "standard", "mode": "Surface", "shippingCost": 85.0},
    {"id": "express", "mode": "Express", "shippingCost": 150.0},
]


class FreeDeliveryOptionsTests(unittest.TestCase):
    def test_prepaid_delivery_becomes_free_and_keeps_the_original_price(self):
        options = _free_delivery_options(PREPAID, PREPAID, "Prepaid")
        self.assertEqual([opt["shippingCost"] for opt in options], [0.0, 0.0])
        self.assertEqual([opt["originalShippingCost"] for opt in options], [60.0, 120.0])
        self.assertTrue(all(opt["freeDelivery"] for opt in options))

    def test_cod_still_pays_the_cod_handling_part_per_option(self):
        options = _free_delivery_options(COD, PREPAID, "COD")
        self.assertEqual([opt["shippingCost"] for opt in options], [25.0, 30.0])

    def test_quotes_are_not_modified(self):
        _free_delivery_options(COD, PREPAID, "COD")
        self.assertEqual(COD[0]["shippingCost"], 85.0)
        self.assertNotIn("freeDelivery", COD[0])


@patch("app.services.shipping_adapter.ConfigPartnerService")
@patch(
    "app.services.shipping_context.get_active_shipping_context",
    return_value={"originPin": "560001", "provider": "delhivery"},
)
class PartnerShippingFreeDeliveryTests(unittest.TestCase):
    def setUp(self):
        storefront_cache.clear()

    def quote(self, service_cls, payment_method, free_delivery, delivery_method="standard"):
        instance = service_cls.return_value
        instance.provider = "delhivery"
        instance.check_serviceability.return_value = {"serviceable": True}
        instance.get_checkout_rate_options.side_effect = (
            lambda _tenant, *, origin_pin, destination_pin, payment_mode: [
                dict(opt) for opt in (COD if payment_mode == "COD" else PREPAID)
            ]
        )
        return _partner_shipping(
            "shop-free",
            {"postalCode": "560002"},
            delivery_method,
            payment_method=payment_method,
            free_delivery=free_delivery,
        )

    def test_online_payment_above_threshold_pays_nothing_for_delivery(self, _ctx, service_cls):
        fee, options, meta = self.quote(service_cls, "upi", True)
        self.assertEqual(fee, 0.0)
        self.assertTrue(meta["freeDelivery"])
        self.assertEqual(options[0]["originalShippingCost"], 60.0)

    def test_cod_above_threshold_pays_only_the_cod_fee(self, _ctx, service_cls):
        fee, _options, meta = self.quote(service_cls, "cod", True)
        self.assertEqual(fee, 25.0)
        self.assertEqual(meta["codHandlingCharge"], 25.0)

    def test_express_is_free_too(self, _ctx, service_cls):
        fee, _options, _meta = self.quote(service_cls, "upi", True, delivery_method="express")
        self.assertEqual(fee, 0.0)

    def test_below_threshold_delivery_is_charged_and_the_cache_is_intact(self, _ctx, service_cls):
        self.quote(service_cls, "upi", True)
        fee, options, meta = self.quote(service_cls, "upi", False)
        self.assertEqual(fee, 60.0)
        self.assertFalse(meta["freeDelivery"])
        self.assertNotIn("freeDelivery", options[0])


class CheckoutThresholdTests(unittest.TestCase):
    def checkout(self, subtotal, discount, threshold):
        partner = MagicMock(return_value=(0.0, [], {"provider": "delhivery", "codHandlingCharge": None}))
        with patch.object(checkout_service, "_load_cart_items", return_value=[]), patch.object(
            checkout_service, "_price_cart_items", return_value=([], subtotal)
        ), patch.object(checkout_service, "_apply_coupon", return_value=(discount, None)), patch.object(
            checkout_service, "resolve_shipping_address", return_value=None
        ), patch.object(checkout_service, "_free_delivery_threshold", return_value=threshold), patch.object(
            checkout_service, "_partner_shipping", partner
        ):
            result = checkout_service.calculate_checkout("shop", "user-1")
        return result, partner.call_args.kwargs["free_delivery"]

    def test_order_value_after_discount_decides(self):
        self.assertTrue(self.checkout(700, 100, 600)[1])  # 600 after discount: free
        self.assertFalse(self.checkout(700, 101, 600)[1])  # 599 after discount: charged
        self.assertFalse(self.checkout(5000, 0, None)[1])  # store has no threshold

    def test_response_tells_the_storefront(self):
        result, _free = self.checkout(900, 0, 600)
        self.assertTrue(result["freeDelivery"])
        self.assertEqual(result["freeDeliveryThreshold"], 600)

    def test_threshold_is_read_from_the_store(self):
        tenants = FakeCollection("tenants")
        tenants.docs.extend(
            [
                {"_id": ObjectId(), "tenantId": "with", "freeDeliveryThreshold": 600},
                {"_id": ObjectId(), "tenantId": "zero", "freeDeliveryThreshold": 0},
                {"_id": ObjectId(), "tenantId": "none"},
            ]
        )
        with patch("app.database.mongo.tenants", tenants):
            self.assertEqual(checkout_service._free_delivery_threshold("with"), 600.0)
            self.assertIsNone(checkout_service._free_delivery_threshold("zero"))
            self.assertIsNone(checkout_service._free_delivery_threshold("none"))


class StoreSettingTests(unittest.TestCase):
    def setUp(self):
        self.tenant_id = ObjectId()
        self.tenants = FakeCollection("tenants")
        self.tenants.docs.append({"_id": self.tenant_id, "tenantId": "store-a", "name": "Store A", "slug": "store-a"})
        for patcher in (
            patch.object(tenant_routes, "tenants", self.tenants),
            patch.object(tenant_routes, "invalidate_tenant"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def save(self, value):
        tenant_routes.update_tenant(
            str(self.tenant_id), UpdateTenant(freeDeliveryThreshold=value), {"role": "admin", "tenantId": "store-a"}
        )
        return self.tenants.docs[0]["freeDeliveryThreshold"]

    def test_threshold_is_saved_and_zero_or_empty_turns_it_off(self):
        self.assertEqual(self.save(600), 600.0)
        self.assertIsNone(self.save(0))
        self.assertIsNone(self.save(None))

    def test_negative_threshold_is_rejected(self):
        with self.assertRaises(Exception):
            UpdateTenant(freeDeliveryThreshold=-1)


if __name__ == "__main__":
    unittest.main()
