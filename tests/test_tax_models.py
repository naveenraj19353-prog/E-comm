"""Validation of the GST fields on the pydantic models.

This is the layer the stdlib-only tax tests cannot reach: that `gstRate: GstRate`
and `hsnCode: HsnCode` actually accept and reject the right inputs once wired
into the request models.

Skips (rather than fails) when pydantic isn't installed, since the rest of the
tax suite is deliberately dependency-free.
"""

import unittest

try:
    from pydantic import ValidationError

    from app.models.category import CreateCategory, UpdateCategory
    from app.models.orders import CreateOrder, OrderItem, OrderTax
    from app.models.product import (
        BulkImportProductItem,
        CreateProduct,
        UpdateProduct,
    )
    from app.models.tenant import TaxSettings

    MODELS_AVAILABLE = True
    IMPORT_ERROR = ""
except Exception as error:  # pragma: no cover - environment dependent
    MODELS_AVAILABLE = False
    IMPORT_ERROR = f"{type(error).__name__}: {error}"


def product(**overrides):
    payload = {
        "tenantId": "t1",
        "name": "Aviator Frame",
        "categoryId": "cat-1",
        "price": 1999.0,
    }
    payload.update(overrides)
    return payload


@unittest.skipUnless(MODELS_AVAILABLE, f"models unavailable: {IMPORT_ERROR}")
class ProductGstFieldTests(unittest.TestCase):
    def test_create_accepts_a_valid_hsn_and_rate(self):
        model = CreateProduct(**product(hsnCode="9004", gstRate=18))

        self.assertEqual(model.hsnCode, "9004")
        self.assertEqual(model.gstRate, 18.0)

    def test_both_fields_default_to_none_so_older_clients_still_work(self):
        model = CreateProduct(**product())

        self.assertIsNone(model.hsnCode)
        self.assertIsNone(model.gstRate)

    def test_blank_strings_become_none(self):
        model = CreateProduct(**product(hsnCode="", gstRate=""))

        self.assertIsNone(model.hsnCode)
        self.assertIsNone(model.gstRate)

    def test_explicit_zero_rate_survives_as_zero(self):
        # 0 is exempt, not "unset" — it must not be coerced to None.
        model = CreateProduct(**product(gstRate=0))

        self.assertEqual(model.gstRate, 0.0)

    def test_an_off_slab_rate_is_rejected(self):
        with self.assertRaises(ValidationError):
            CreateProduct(**product(gstRate=7))

    def test_a_bad_hsn_length_is_rejected(self):
        for bad in ["123", "12345", "12ab"]:
            with self.assertRaises(ValidationError, msg=bad):
                CreateProduct(**product(hsnCode=bad))

    def test_update_product_carries_the_same_rules(self):
        model = UpdateProduct(tenantId="t1", hsnCode="900490", gstRate=12)

        self.assertEqual(model.hsnCode, "900490")
        self.assertEqual(model.gstRate, 12.0)
        with self.assertRaises(ValidationError):
            UpdateProduct(tenantId="t1", gstRate=7)

    def test_bulk_import_carries_the_same_rules(self):
        # A CSV round trip must not silently drop or corrupt GST data.
        item = BulkImportProductItem(
            name="Frame", categoryId="cat-1", price=100.0, hsnCode="9004", gstRate=5
        )

        self.assertEqual(item.hsnCode, "9004")
        self.assertEqual(item.gstRate, 5.0)
        with self.assertRaises(ValidationError):
            BulkImportProductItem(
                name="Frame", categoryId="cat-1", price=100.0, hsnCode="90049"
            )

    def test_half_percent_slab_is_allowed(self):
        self.assertEqual(CreateProduct(**product(gstRate=0.5)).gstRate, 0.5)


@unittest.skipUnless(MODELS_AVAILABLE, f"models unavailable: {IMPORT_ERROR}")
class CategoryGstFieldTests(unittest.TestCase):
    def valid_category(self, **overrides):
        payload = {
            "tenantId": "t1",
            "name": "Eyewear",
            "description": "Sunglasses and frames",
            "image": "https://example.com/cat.png",
        }
        payload.update(overrides)
        return payload

    def test_create_category_accepts_a_default_rate(self):
        model = CreateCategory(**self.valid_category(defaultGstRate=18))

        self.assertEqual(model.defaultGstRate, 18.0)

    def test_create_category_defaults_to_unset(self):
        self.assertIsNone(CreateCategory(**self.valid_category()).defaultGstRate)

    def test_off_slab_category_rate_is_rejected(self):
        with self.assertRaises(ValidationError):
            CreateCategory(**self.valid_category(defaultGstRate=7))

    def test_update_category_accepts_and_validates_a_rate(self):
        self.assertEqual(
            UpdateCategory(tenantId="t1", defaultGstRate=12).defaultGstRate, 12.0
        )
        with self.assertRaises(ValidationError):
            UpdateCategory(tenantId="t1", defaultGstRate=99)


@unittest.skipUnless(MODELS_AVAILABLE, f"models unavailable: {IMPORT_ERROR}")
class OrderTaxModelTests(unittest.TestCase):
    def order_item(self, **overrides):
        payload = {
            "productId": "p1",
            "name": "Frame",
            "price": 100.0,
            "quantity": 2,
            "subtotal": 200.0,
        }
        payload.update(overrides)
        return payload

    def test_order_item_carries_the_tax_snapshot(self):
        item = OrderItem(
            **self.order_item(
                hsnCode="9004", gstRate=18, taxableValue=169.49, taxAmount=30.51
            )
        )

        self.assertEqual(item.gstRate, 18.0)
        self.assertEqual(item.taxAmount, 30.51)

    def test_order_item_tax_fields_are_optional(self):
        item = OrderItem(**self.order_item())

        self.assertIsNone(item.gstRate)
        self.assertIsNone(item.taxAmount)

    def test_tax_block_defaults_to_all_zero(self):
        tax = OrderTax()

        self.assertEqual(tax.totalTax, 0.0)
        self.assertEqual(tax.taxableValue, 0.0)
        self.assertTrue(tax.taxInclusive)
        self.assertEqual(tax.rateWise, [])
        self.assertEqual(tax.lines, [])

    def test_tax_block_accepts_the_engine_output_shape(self):
        tax = OrderTax(
            interState=True,
            igst=6100.17,
            totalTax=6100.17,
            taxableValue=33889.83,
            grandTotal=39990.0,
            rateWise=[{"rate": 18.0, "taxableValue": 33889.83, "tax": 6100.17}],
            lines=[{"name": "Frame", "gstRate": 18.0, "taxAmount": 6100.17}],
        )

        self.assertEqual(tax.igst, 6100.17)
        self.assertEqual(tax.rateWise[0]["rate"], 18.0)

    def test_create_order_accepts_an_optional_tax_block(self):
        model = CreateOrder(
            tenantId="t1",
            userId="u1",
            razorpayOrderId="order_1",
            razorpayPaymentId="pay_1",
            items=[self.order_item()],
            subtotal=200.0,
            totalAmount=236.0,
            tax=OrderTax(totalTax=36.0, grandTotal=236.0),
        )

        self.assertEqual(model.tax.totalTax, 36.0)

    def test_create_order_without_a_tax_block_is_still_valid(self):
        model = CreateOrder(
            tenantId="t1",
            userId="u1",
            razorpayOrderId="order_1",
            razorpayPaymentId="pay_1",
            items=[self.order_item()],
            subtotal=200.0,
            totalAmount=200.0,
        )

        self.assertIsNone(model.tax)


@unittest.skipUnless(MODELS_AVAILABLE, f"models unavailable: {IMPORT_ERROR}")
class TenantTaxSettingsTests(unittest.TestCase):
    def test_defaults_are_inert(self):
        # Nothing is taxed until a rate is configured.
        settings = TaxSettings()

        self.assertEqual(settings.defaultGstRate, 0.0)
        self.assertTrue(settings.pricesIncludeTax)
        self.assertFalse(settings.compositionScheme)
        self.assertIsNone(settings.stateCode)

    def test_default_rate_accepts_slabs_only(self):
        self.assertEqual(TaxSettings(defaultGstRate=12).defaultGstRate, 12.0)
        with self.assertRaises(ValidationError):
            # Would otherwise be stored and then silently ignored by the engine.
            TaxSettings(defaultGstRate=7)

    def test_state_code_is_limited_to_two_characters(self):
        self.assertEqual(TaxSettings(stateCode="29").stateCode, "29")
        with self.assertRaises(ValidationError):
            TaxSettings(stateCode="KA29")


if __name__ == "__main__":
    unittest.main()
