"""GST calculation and tax-invoicing tests.

The engine and invoice service are exercised against in-memory stand-ins for
their Mongo collections, so this suite needs no database.
"""

import unittest
from datetime import datetime, timezone
from decimal import Decimal

from bson import ObjectId

from app.services import invoice_service, tax_service


class FakeCursor:
    def __init__(self, documents):
        self._documents = list(documents)

    def __iter__(self):
        return iter(self._documents)

    def sort(self, key, direction=1):
        self._documents.sort(key=lambda doc: doc.get(key), reverse=direction < 0)
        return self


class FakeCollection:
    """Enough of the pymongo surface for these tests."""

    def __init__(self, documents=None):
        self.documents = list(documents or [])

    def _matches(self, document, query):
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict) and "$in" in expected:
                if actual not in expected["$in"]:
                    return False
                continue
            if actual != expected:
                return False
        return True

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor(
            [doc for doc in self.documents if self._matches(doc, query)]
        )

    def find_one(self, query=None):
        for document in self.documents:
            if self._matches(document, query or {}):
                return document
        return None

    def insert_one(self, document):
        from pymongo.errors import DuplicateKeyError

        for existing in self.documents:
            if existing.get("tenantId") == document.get("tenantId") and existing.get(
                "orderId"
            ) == document.get("orderId"):
                raise DuplicateKeyError("duplicate")
        document.setdefault("_id", ObjectId())
        self.documents.append(document)

        class Result:
            inserted_id = document["_id"]

        return Result()

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        for document in self.documents:
            if self._matches(document, query):
                document["seq"] = document.get("seq", 0) + update["$inc"]["seq"]
                return document
        if not upsert:
            return None
        document = {**query, "seq": update["$inc"]["seq"]}
        self.documents.append(document)
        return document


def product_document(tenant_id, tax=None):
    return {
        "_id": ObjectId(),
        "tenantId": tenant_id,
        "tax": tax
        or {"hsnSac": "9004", "taxRate": 18, "cessRate": 0, "taxStatus": "taxable"},
    }


def profile_document(**overrides):
    document = {
        "tenantId": "shop",
        "enabled": True,
        "stateCode": "29",
        "priceIncludesTax": True,
        "defaultTaxRate": 18,
        "shippingTaxRate": 0,
    }
    document.update(overrides)
    return document


def item(product_id, subtotal, quantity=1, name="Item"):
    return {
        "productId": str(product_id),
        "name": name,
        "subtotal": subtotal,
        "quantity": quantity,
    }


class TaxEngineTests(unittest.TestCase):
    def setUp(self):
        self.products = FakeCollection()
        self.profiles = FakeCollection()
        self._original_products = tax_service.products
        self._original_profiles = tax_service.tax_profiles
        tax_service.products = self.products
        tax_service.tax_profiles = self.profiles

    def tearDown(self):
        tax_service.products = self._original_products
        tax_service.tax_profiles = self._original_profiles

    def test_gst_off_is_backward_compatible(self):
        # No profile at all: tax is zero and the legacy total is untouched.
        result = tax_service.calculate_order_tax("shop", [item(ObjectId(), 500)])

        self.assertFalse(result["enabled"])
        self.assertEqual(result["taxTotal"], 0.0)
        self.assertEqual(result["taxableTotal"], 500.0)
        self.assertEqual(result["lines"], [])

    def test_disabled_profile_behaves_like_no_profile(self):
        self.profiles.documents.append(profile_document(enabled=False))
        result = tax_service.calculate_order_tax(
            "shop", [item(ObjectId(), 500)], destination_state="Karnataka"
        )

        self.assertFalse(result["enabled"])
        self.assertEqual(result["taxTotal"], 0.0)

    def test_intrastate_inclusive_splits_cgst_and_sgst(self):
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document())

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 118)], destination_state="Karnataka"
        )

        self.assertFalse(result["interstate"])
        self.assertEqual(result["taxableTotal"], 100.0)
        self.assertEqual(result["cgst"], 9.0)
        self.assertEqual(result["sgst"], 9.0)
        self.assertEqual(result["igst"], 0.0)
        # Inclusive: the customer's payable does not move.
        self.assertEqual(
            tax_service.total_from_tax_snapshot(118, 0, 0, result), 118.0
        )

    def test_interstate_exclusive_charges_igst_on_top(self):
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(priceIncludesTax=False))

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 100)], destination_state="Tamil Nadu"
        )

        self.assertTrue(result["interstate"])
        self.assertEqual(result["igst"], 18.0)
        self.assertEqual(result["cgst"], 0.0)
        self.assertEqual(tax_service.total_from_tax_snapshot(100, 0, 0, result), 118.0)

    def test_state_abbreviation_resolves(self):
        # Real addresses hold "KA", not "Karnataka"; failing to resolve it would
        # block checkout rather than tax it.
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document())

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 118)], destination_state="KA"
        )

        self.assertFalse(result["interstate"])
        self.assertEqual(result["placeOfSupplyStateCode"], "29")

    def test_unresolvable_destination_raises_rather_than_guessing(self):
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document())

        with self.assertRaises(ValueError):
            tax_service.calculate_order_tax(
                "shop", [item(product["_id"], 118)], destination_state="Atlantis"
            )
        with self.assertRaises(ValueError):
            tax_service.calculate_order_tax("shop", [item(product["_id"], 118)])

    def test_missing_supplier_state_raises(self):
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(stateCode="", state=""))

        with self.assertRaises(ValueError):
            tax_service.calculate_order_tax(
                "shop", [item(product["_id"], 118)], destination_state="Karnataka"
            )

    def test_exempt_status_zeroes_the_rate(self):
        product = product_document(
            "shop", {"hsnSac": "0401", "taxRate": 18, "taxStatus": "exempt"}
        )
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document())

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 118)], destination_state="Karnataka"
        )

        self.assertEqual(result["taxTotal"], 0.0)
        self.assertEqual(result["taxableTotal"], 118.0)

    def test_nil_rated_and_non_gst_also_zero(self):
        for status in ("nil_rated", "non_gst"):
            with self.subTest(status=status):
                products = FakeCollection(
                    [product_document("shop", {"taxRate": 18, "taxStatus": status})]
                )
                tax_service.products = products
                product = products.documents[0]
                self.profiles.documents = [profile_document()]

                result = tax_service.calculate_order_tax(
                    "shop",
                    [item(product["_id"], 118)],
                    destination_state="Karnataka",
                )

                self.assertEqual(result["taxTotal"], 0.0)

    def test_cess_is_part_of_the_inclusive_divisor(self):
        # An inclusive price of 128 covers 18% GST + 10% cess, so the taxable
        # value is 128 / 1.28 = 100, not 128 / 1.18.
        product = product_document(
            "shop", {"taxRate": 18, "cessRate": 10, "taxStatus": "taxable"}
        )
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(defaultTaxRate=18))

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 128)], destination_state="Karnataka"
        )

        self.assertEqual(result["taxableTotal"], 100.0)
        self.assertEqual(result["cess"], 10.0)
        self.assertEqual(result["cgst"] + result["sgst"], 18.0)
        self.assertEqual(result["taxTotal"], 28.0)

    def test_product_rate_beats_the_store_default(self):
        product = product_document("shop", {"taxRate": 5, "taxStatus": "taxable"})
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(defaultTaxRate=18))

        result = tax_service.calculate_order_tax(
            "shop",
            [item(product["_id"], 105)],
            destination_state="Karnataka",
            discount=0,
        )

        self.assertEqual(result["lines"][0]["rate"], 5.0)
        self.assertEqual(result["taxableTotal"], 100.0)

    def test_unknown_product_falls_back_to_the_store_default(self):
        # The batch loader must preserve the per-line fallback the sequential
        # lookup had.
        self.profiles.documents.append(profile_document(defaultTaxRate=18))

        result = tax_service.calculate_order_tax(
            "shop", [item(ObjectId(), 118)], destination_state="Karnataka"
        )

        self.assertEqual(result["lines"][0]["rate"], 18.0)
        self.assertEqual(result["taxableTotal"], 100.0)

    def test_discount_is_allocated_before_tax(self):
        first = product_document("shop", {"taxRate": 5, "taxStatus": "taxable"})
        second = product_document("shop", {"taxRate": 5, "taxStatus": "taxable"})
        self.products.documents.extend([first, second])
        self.profiles.documents.append(
            profile_document(defaultTaxRate=5, priceIncludesTax=False)
        )

        result = tax_service.calculate_order_tax(
            "shop",
            [item(first["_id"], 100), item(second["_id"], 300)],
            discount=40,
            destination_state="Karnataka",
        )

        self.assertEqual(result["taxableTotal"], 360.0)
        self.assertEqual(result["taxTotal"], 18.0)
        self.assertEqual(result["lines"][0]["discount"], 10.0)
        self.assertEqual(result["lines"][1]["discount"], 30.0)

    def test_discount_allocations_always_sum_to_the_discount(self):
        products = [product_document("shop") for _ in range(3)]
        self.products.documents.extend(products)
        self.profiles.documents.append(profile_document())

        result = tax_service.calculate_order_tax(
            "shop",
            [item(p["_id"], 10) for p in products],
            discount=10,
            destination_state="Karnataka",
        )

        allocated = sum(line["discount"] for line in result["lines"])
        self.assertAlmostEqual(allocated, 10.0, places=2)

    def test_discount_cannot_exceed_the_cart(self):
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(priceIncludesTax=False))

        result = tax_service.calculate_order_tax(
            "shop",
            [item(product["_id"], 100)],
            discount=500,
            destination_state="Karnataka",
        )

        self.assertEqual(result["taxableTotal"], 0.0)
        self.assertEqual(result["taxTotal"], 0.0)

    def test_shipping_is_taxed_at_its_own_rate(self):
        product = product_document("shop", {"taxRate": 18, "taxStatus": "taxable"})
        self.products.documents.append(product)
        self.profiles.documents.append(
            profile_document(defaultTaxRate=18, shippingTaxRate=5)
        )

        result = tax_service.calculate_order_tax(
            "shop",
            [item(product["_id"], 118)],
            shipping=105,
            destination_state="Karnataka",
        )

        self.assertIsNotNone(result["shippingTax"])
        self.assertEqual(result["shippingTax"]["rate"], 5.0)
        self.assertEqual(result["shippingTax"]["taxableValue"], 100.0)

    def test_shipping_at_zero_rate_adds_no_tax(self):
        # A shipping line is still reported (so the invoice can show it), but
        # with a zero rate it must contribute nothing to the tax total.
        product = product_document("shop")
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document(shippingTaxRate=0))

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 118)], shipping=50,
            destination_state="Karnataka",
        )

        self.assertEqual(result["shippingTax"]["rate"], 0.0)
        self.assertEqual(result["shippingTax"]["cgst"], 0.0)
        self.assertEqual(result["shippingTax"]["sgst"], 0.0)
        self.assertEqual(result["shippingTax"]["igst"], 0.0)

    def test_lines_carry_hsn_and_status_for_the_invoice(self):
        product = product_document(
            "shop",
            {"hsnSac": "900490", "taxRate": 12, "cessRate": 0, "taxStatus": "taxable"},
        )
        self.products.documents.append(product)
        self.profiles.documents.append(profile_document())

        result = tax_service.calculate_order_tax(
            "shop", [item(product["_id"], 112, name="Frame")],
            destination_state="Karnataka",
        )

        line = result["lines"][0]
        self.assertEqual(line["hsnSac"], "900490")
        self.assertEqual(line["taxStatus"], "taxable")
        self.assertEqual(line["name"], "Frame")


class ZeroShippingTotalsTests(unittest.TestCase):
    """The menu/pickup path, which can have no delivery address at all."""

    def setUp(self):
        from app.services import checkout_service

        self.checkout_service = checkout_service
        self.profiles = FakeCollection([profile_document()])
        self._original_profiles = tax_service.tax_profiles
        tax_service.tax_profiles = self.profiles

    def tearDown(self):
        tax_service.tax_profiles = self._original_profiles

    def checkout_data(self, state=None):
        product_id = ObjectId()
        return {
            "subtotal": 118.0,
            "discount": 0.0,
            "shipping": 25.0,
            "grandTotal": 143.0,
            "address": {"state": state} if state else None,
            "items": [
                {
                    "productId": str(product_id),
                    "name": "Thali",
                    "subtotal": 118.0,
                    "quantity": 1,
                }
            ],
        }

    def test_unresolvable_state_surfaces_as_a_400_not_a_500(self):
        from fastapi import HTTPException

        # Menu orders often have no address. An uncaught ValueError here would
        # have been a 500 on a live checkout.
        with self.assertRaises(HTTPException) as caught:
            self.checkout_service.apply_zero_shipping_totals(
                self.checkout_data(), "shop"
            )
        self.assertEqual(caught.exception.status_code, 400)

    def test_valid_state_zeroes_shipping_and_retotals(self):
        data = self.checkout_service.apply_zero_shipping_totals(
            self.checkout_data("Karnataka"), "shop"
        )

        self.assertEqual(data["shipping"], 0.0)
        # Inclusive: the payable is unchanged by removing an untaxed delivery fee.
        self.assertEqual(data["grandTotal"], 118.0)
        self.assertTrue(data["tax"]["enabled"])

    def test_store_without_gst_is_untouched(self):
        tax_service.tax_profiles = FakeCollection()

        data = self.checkout_service.apply_zero_shipping_totals(
            self.checkout_data(), "shop"
        )

        self.assertEqual(data["shipping"], 0.0)
        self.assertEqual(data["grandTotal"], 118.0)
        self.assertFalse(data["tax"]["enabled"])


class TaxTotalTests(unittest.TestCase):
    def test_inclusive_total_is_unchanged(self):
        tax = {"enabled": True, "priceIncludesTax": True, "taxTotal": 18.0}
        self.assertEqual(tax_service.total_from_tax_snapshot(118, 0, 0, tax), 118.0)

    def test_exclusive_total_adds_tax(self):
        tax = {"enabled": True, "priceIncludesTax": False, "taxTotal": 18.0}
        self.assertEqual(tax_service.total_from_tax_snapshot(100, 0, 0, tax), 118.0)

    def test_disabled_tax_never_adds(self):
        tax = {"enabled": False, "taxTotal": 18.0}
        self.assertEqual(tax_service.total_from_tax_snapshot(100, 0, 0, tax), 100.0)

    def test_discount_and_shipping_are_applied(self):
        tax = {"enabled": True, "priceIncludesTax": False, "taxTotal": 18.0}
        self.assertEqual(
            tax_service.total_from_tax_snapshot(200, 50, 10, tax), 178.0
        )

    def test_rounding_is_half_up(self):
        self.assertEqual(tax_service.money(Decimal("2.675")), Decimal("2.68"))


class FinancialYearTests(unittest.TestCase):
    def test_year_rolls_over_on_first_april(self):
        self.assertEqual(
            invoice_service.financial_year(datetime(2026, 3, 31, tzinfo=timezone.utc)),
            "2025-26",
        )
        self.assertEqual(
            invoice_service.financial_year(datetime(2026, 4, 1, tzinfo=timezone.utc)),
            "2026-27",
        )
        self.assertEqual(
            invoice_service.financial_year(datetime(2026, 9, 26, tzinfo=timezone.utc)),
            "2026-27",
        )


class InvoiceServiceTests(unittest.TestCase):
    def setUp(self):
        self.originals = {
            name: getattr(invoice_service, name)
            for name in ("counters", "invoices", "credit_notes", "tax_profiles")
        }
        invoice_service.counters = FakeCollection()
        invoice_service.invoices = FakeCollection()
        invoice_service.credit_notes = FakeCollection()
        self.profiles = FakeCollection(
            [
                {
                    "tenantId": "shop",
                    "enabled": True,
                    "gstin": "29ABCDE1234F1Z5",
                    "legalName": "Shop LLP",
                    "invoicePrefix": "INV",
                    "stateCode": "29",
                }
            ]
        )
        invoice_service.tax_profiles = self.profiles

    def tearDown(self):
        for name, collection in self.originals.items():
            setattr(invoice_service, name, collection)

    def order(self, tax=None):
        return {
            "_id": ObjectId(),
            "tenantId": "shop",
            "orderNumber": 7,
            "subtotal": 118.0,
            "discount": 0.0,
            "shipping": 0.0,
            "totalAmount": 118.0,
            "address": {"state": "Karnataka"},
            "items": [{"name": "Frame"}],
            "tax": tax if tax is not None else {"enabled": True, "taxTotal": 18.0},
        }

    def test_invoice_number_format_and_sequence(self):
        first = invoice_service.issue_invoice(self.order())
        second = invoice_service.issue_invoice(self.order())

        self.assertEqual(first["invoiceNumber"], "INV/2026-27/000001")
        self.assertEqual(second["invoiceNumber"], "INV/2026-27/000002")
        self.assertEqual(first["financialYear"], "2026-27")
        self.assertEqual(first["status"], "issued")

    def test_issuance_is_idempotent_per_order(self):
        order = self.order()
        first = invoice_service.issue_invoice(order)
        again = invoice_service.issue_invoice(order)

        self.assertEqual(first["invoiceNumber"], again["invoiceNumber"])
        self.assertEqual(len(invoice_service.invoices.documents), 1)

    def test_invoice_carries_supplier_and_snapshot(self):
        invoice = invoice_service.issue_invoice(self.order())

        self.assertEqual(invoice["supplier"]["gstin"], "29ABCDE1234F1Z5")
        self.assertEqual(invoice["supplier"]["legalName"], "Shop LLP")
        self.assertEqual(invoice["tax"]["taxTotal"], 18.0)
        self.assertEqual(invoice["recipient"]["state"], "Karnataka")

    def test_invoice_requires_gst_to_be_enabled(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as caught:
            invoice_service.issue_invoice(
                self.order(tax={"enabled": False, "taxTotal": 0.0})
            )
        self.assertEqual(caught.exception.status_code, 409)

    def test_invoice_requires_a_gstin_on_the_profile(self):
        from fastapi import HTTPException

        invoice_service.tax_profiles = FakeCollection(
            [{"tenantId": "shop", "enabled": True, "gstin": ""}]
        )
        with self.assertRaises(HTTPException) as caught:
            invoice_service.issue_invoice(self.order())
        self.assertEqual(caught.exception.status_code, 409)

    def test_credit_note_defaults_to_the_whole_invoice(self):
        invoice = invoice_service.issue_invoice(self.order())
        note = invoice_service.create_credit_note(invoice, "Customer returned")

        self.assertEqual(note["amount"], 118.0)
        self.assertEqual(note["creditNoteNumber"], "CN/2026-27/000001")
        self.assertEqual(note["invoiceNumber"], invoice["invoiceNumber"])
        self.assertEqual(note["reason"], "Customer returned")

    def test_credit_note_accepts_a_partial_amount(self):
        invoice = invoice_service.issue_invoice(self.order())
        note = invoice_service.create_credit_note(invoice, "Partial", 50.0)

        self.assertEqual(note["amount"], 50.0)

    def test_credit_note_cannot_exceed_the_invoice(self):
        from fastapi import HTTPException

        invoice = invoice_service.issue_invoice(self.order())
        with self.assertRaises(HTTPException) as caught:
            invoice_service.create_credit_note(invoice, "Too much", 500.0)
        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
