"""GST calculation tests.

The service is stdlib-only on purpose, so these run without FastAPI, pymongo or
a database.
"""

import unittest

from app.services.tax_service import (
    TaxPolicy,
    TaxableLine,
    compute_tax,
    is_valid_gst_rate,
    normalize_gst_rate,
    normalize_hsn,
    resolve_gst_rate,
    round_money,
    round_to_rupee,
    state_code_for,
    state_code_from_gstin,
    taxable_amount_for_rate,
)


def line(price, qty=1, rate=18.0, discount=0.0, name="item"):
    return TaxableLine(
        quantity=qty, unit_price=price, gst_rate=rate, discount=discount, name=name
    )


class RoundingTests(unittest.TestCase):
    def test_round_money_is_commercial_not_bankers(self):
        # 0.125 is exactly representable, and Python's round() would give 0.12.
        self.assertEqual(round_money(0.125), 0.13)
        self.assertEqual(round(0.125, 2), 0.12)

    def test_round_to_rupee_is_half_away_from_zero(self):
        self.assertEqual(round_to_rupee(117.6), 118)
        self.assertEqual(round_to_rupee(2.5), 3)
        self.assertEqual(round(2.5), 2)

    def test_rate_validation(self):
        self.assertTrue(is_valid_gst_rate(18))
        self.assertTrue(is_valid_gst_rate("5"))
        self.assertFalse(is_valid_gst_rate(7))
        self.assertFalse(is_valid_gst_rate(None))
        self.assertFalse(is_valid_gst_rate("abc"))


class StateCodeTests(unittest.TestCase):
    def test_aliases_and_codes_land_on_the_same_code(self):
        for value in ["Karnataka", "karnataka", " KA ", "29", "29 ", "ka"]:
            self.assertEqual(state_code_for(value), "29", msg=repr(value))

    def test_historical_and_alternate_names(self):
        self.assertEqual(state_code_for("Orissa"), "21")
        self.assertEqual(state_code_for("Pondicherry"), "34")
        self.assertEqual(state_code_for("Uttaranchal"), "05")
        self.assertEqual(state_code_for("NCT of Delhi"), "07")
        self.assertEqual(state_code_for("Tamilnadu"), "33")

    def test_unknown_state_returns_none(self):
        self.assertIsNone(state_code_for("Bombay"))
        self.assertIsNone(state_code_for(""))
        self.assertIsNone(state_code_for(None))
        self.assertIsNone(state_code_for("25"))  # retired code

    def test_state_code_from_gstin(self):
        self.assertEqual(state_code_from_gstin("29ABCDE1234F1Z5"), "29")
        self.assertEqual(state_code_from_gstin(" 07ABCDE1234F1Z5"), "07")
        self.assertIsNone(state_code_from_gstin("25ABCDE1234F1Z5"))  # retired code
        self.assertIsNone(state_code_from_gstin(""))
        self.assertIsNone(state_code_from_gstin(None))


class InclusivePricingTests(unittest.TestCase):
    def test_tax_is_derived_and_payable_is_unchanged(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.lines[0].taxable_value, 100.0)
        self.assertEqual(result.total_tax, 18.0)
        # The customer pays the listed price: nothing about the payable moves.
        self.assertEqual(result.grand_total, 118.0)
        self.assertFalse(result.inter_state)

    def test_exclusive_pricing_adds_tax_on_top(self):
        result = compute_tax(
            [line(100.0)],
            policy=TaxPolicy(inclusive=False, seller_state_code="29"),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.total_taxable_value, 100.0)
        self.assertEqual(result.total_tax, 18.0)
        self.assertEqual(result.payable, 118.0)

    def test_untaxed_store_charges_nothing(self):
        result = compute_tax(
            [line(500.0, rate=0.0)],
            policy=TaxPolicy(inclusive=True),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.total_tax, 0.0)
        self.assertEqual(result.total_taxable_value, 500.0)
        self.assertEqual(result.grand_total, 500.0)


class PlaceOfSupplyTests(unittest.TestCase):
    def test_intra_state_splits_cgst_and_sgst_exactly(self):
        result = compute_tax(
            [line(99.99)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )
        taxed = result.lines[0]

        self.assertEqual(taxed.igst, 0.0)
        self.assertEqual(taxed.cgst, 7.63)
        self.assertEqual(taxed.sgst, 7.62)
        # The halves must re-add to the line tax or an invoice will not balance.
        self.assertEqual(round_money(taxed.cgst + taxed.sgst), taxed.tax_amount)

    def test_inter_state_uses_igst_only(self):
        result = compute_tax(
            [line(99.99)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Maharashtra",
        )
        taxed = result.lines[0]

        self.assertTrue(result.inter_state)
        self.assertEqual(taxed.cgst, 0.0)
        self.assertEqual(taxed.sgst, 0.0)
        self.assertEqual(taxed.igst, taxed.tax_amount)

    def test_unknown_place_of_supply_assumes_seller_state_and_flags_it(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply=None,
        )

        self.assertTrue(result.assumed_seller_state)
        self.assertFalse(result.inter_state)
        self.assertEqual(result.cgst_total, 9.0)
        self.assertEqual(result.sgst_total, 9.0)

    def test_free_text_state_spelling_does_not_leak_into_igst(self):
        # "karnataka" must not be read as inter-state just because it is untidy.
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="karnataka",
        )

        self.assertFalse(result.inter_state)
        self.assertEqual(result.igst_total, 0.0)


class DiscountTests(unittest.TestCase):
    def test_discount_reduces_the_taxable_value(self):
        result = compute_tax(
            [line(118.0, discount=18.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )
        taxed = result.lines[0]

        self.assertEqual(taxed.net, 100.0)
        self.assertEqual(taxed.taxable_value, 84.75)
        self.assertEqual(taxed.tax_amount, 15.25)

    def test_discount_cannot_exceed_the_line(self):
        result = compute_tax(
            [line(100.0, discount=250.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.lines[0].net, 0.0)
        self.assertEqual(result.grand_total, 0.0)


class CompositionSchemeTests(unittest.TestCase):
    def test_composition_dealer_charges_no_tax(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, composition=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.total_tax, 0.0)
        self.assertEqual(result.cgst_total, 0.0)
        self.assertEqual(result.sgst_total, 0.0)
        self.assertEqual(result.total_taxable_value, 118.0)


class FreightTests(unittest.TestCase):
    def test_freight_follows_the_principal_supply_rate(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
            shipping_amount=60.0,
        )

        self.assertTrue(result.shipping_taxable)
        self.assertEqual(result.shipping_tax, 9.15)
        self.assertEqual(result.total_tax, 27.15)
        self.assertEqual(result.grand_total, 178.0)

    def test_freight_can_be_left_untaxed(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(
                inclusive=True, freight_taxable=False, seller_state_code="29"
            ),
            place_of_supply="Karnataka",
            shipping_amount=60.0,
        )

        self.assertFalse(result.shipping_taxable)
        self.assertEqual(result.shipping_tax, 0.0)
        self.assertEqual(result.total_tax, 18.0)
        # Freight is still payable, just not taxed.
        self.assertEqual(result.grand_total, 178.0)

    def test_explicit_freight_rate_wins(self):
        result = compute_tax(
            [line(100.0, rate=5.0)],
            policy=TaxPolicy(inclusive=False, seller_state_code="29"),
            place_of_supply="Karnataka",
            shipping_amount=100.0,
            shipping_gst_rate=18.0,
        )

        self.assertEqual(result.shipping_tax, 18.0)


class InvoiceRoundingTests(unittest.TestCase):
    def test_round_off_is_inside_the_grand_total(self):
        result = compute_tax(
            [line(117.60)],
            policy=TaxPolicy(
                inclusive=True, round_to_rupee_on_invoice=True, seller_state_code="29"
            ),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.payable, 117.60)
        self.assertEqual(result.round_off, 0.40)
        self.assertEqual(result.grand_total, 118.0)
        # Payment validation compares this figure, so it must already include it.
        self.assertEqual(round_money(result.payable + result.round_off), 118.0)

    def test_rounding_can_be_disabled(self):
        result = compute_tax(
            [line(117.60)],
            policy=TaxPolicy(
                inclusive=True, round_to_rupee_on_invoice=False, seller_state_code="29"
            ),
            place_of_supply="Karnataka",
        )

        self.assertEqual(result.round_off, 0.0)
        self.assertEqual(result.grand_total, 117.60)


class TenantPolicyTests(unittest.TestCase):
    def test_defaults_are_inert(self):
        policy = TaxPolicy.from_tenant({})

        self.assertTrue(policy.inclusive)
        self.assertFalse(policy.composition)
        self.assertEqual(policy.default_gst_rate, 0.0)
        self.assertIsNone(policy.seller_state_code)

        result = compute_tax([line(500.0, rate=0.0)], policy=policy)
        self.assertEqual(result.total_tax, 0.0)

    def test_seller_state_is_derived_from_the_gstin(self):
        policy = TaxPolicy.from_tenant(
            {"businessDetails": {"gstin": "29ABCDE1234F1Z5"}}
        )

        self.assertEqual(policy.seller_state_code, "29")

    def test_explicit_state_code_beats_the_gstin(self):
        policy = TaxPolicy.from_tenant(
            {
                "businessDetails": {"gstin": "29ABCDE1234F1Z5", "state": "Karnataka"},
                "tax": {"stateCode": "27"},
            }
        )

        self.assertEqual(policy.seller_state_code, "27")

    def test_falls_back_to_the_business_state_name(self):
        policy = TaxPolicy.from_tenant({"businessDetails": {"state": "Gujarat"}})

        self.assertEqual(policy.seller_state_code, "24")

    def test_line_rate_is_taken_literally(self):
        # 0 on a line means exempt. It must not silently pick up the store
        # default, or nil-rated goods would start being taxed.
        policy = TaxPolicy.from_tenant({"tax": {"defaultGstRate": 12}})
        result = compute_tax(
            [line(112.0, rate=0.0), line(118.0, rate=18.0)], policy=policy
        )

        self.assertEqual(result.lines[0].gst_rate, 0.0)
        self.assertEqual(result.lines[0].tax_amount, 0.0)
        self.assertEqual(result.lines[1].gst_rate, 18.0)

    def test_invalid_default_rate_is_ignored(self):
        policy = TaxPolicy.from_tenant({"tax": {"defaultGstRate": 7}})

        self.assertEqual(policy.default_gst_rate, 0.0)


class SummaryTests(unittest.TestCase):
    def test_mixed_rates_are_bucketed_by_rate(self):
        result = compute_tax(
            [line(118.0, rate=18.0), line(105.0, rate=5.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )
        summary = taxable_amount_for_rate(result)

        self.assertEqual([bucket["rate"] for bucket in summary], [5.0, 18.0])
        self.assertEqual(summary[0]["taxableValue"], 100.0)
        self.assertEqual(summary[0]["tax"], 5.0)
        self.assertEqual(summary[1]["tax"], 18.0)

    def test_order_snapshot_document_shape(self):
        result = compute_tax(
            [line(118.0)],
            policy=TaxPolicy(inclusive=True, seller_state_code="29"),
            place_of_supply="Karnataka",
        )
        document = result.as_document()

        self.assertEqual(document["grandTotal"], 118.0)
        self.assertEqual(document["cgst"], 9.0)
        self.assertEqual(document["sgst"], 9.0)
        self.assertEqual(document["igst"], 0.0)
        self.assertEqual(document["placeOfSupply"], "29")
        self.assertTrue(document["taxInclusive"])


class HsnAndRateValidationTests(unittest.TestCase):
    def test_hsn_accepts_four_six_and_eight_digits(self):
        for value in ["1234", "123456", "12345678", " 1234 "]:
            self.assertEqual(normalize_hsn(value), value.strip(), msg=repr(value))

    def test_hsn_blank_becomes_none(self):
        self.assertIsNone(normalize_hsn(None))
        self.assertIsNone(normalize_hsn(""))
        self.assertIsNone(normalize_hsn("   "))

    def test_hsn_rejects_wrong_lengths_and_non_digits(self):
        for value in ["123", "12345", "abcd", "1234A", "1234567890"]:
            with self.assertRaises(ValueError, msg=repr(value)):
                normalize_hsn(value)

    def test_rate_accepts_statutory_slabs(self):
        self.assertEqual(normalize_gst_rate(18), 18.0)
        self.assertEqual(normalize_gst_rate("5"), 5.0)
        self.assertEqual(normalize_gst_rate(0), 0.0)
        self.assertEqual(normalize_gst_rate(0.5), 0.5)

    def test_rate_blank_becomes_none(self):
        self.assertIsNone(normalize_gst_rate(None))
        self.assertIsNone(normalize_gst_rate(""))

    def test_rate_outside_the_slabs_is_rejected_not_clamped(self):
        # Clamping 7 to 5 or 12 would mis-state an invoice.
        with self.assertRaises(ValueError):
            normalize_gst_rate(7)
        with self.assertRaises(ValueError):
            normalize_gst_rate(100)
        with self.assertRaises(ValueError):
            normalize_gst_rate("abc")


class RateResolutionTests(unittest.TestCase):
    def policy(self, **overrides):
        settings = {"defaultGstRate": 18.0}
        settings.update(overrides)
        return TaxPolicy.from_tenant({"tax": settings})

    def test_product_rate_wins(self):
        self.assertEqual(
            resolve_gst_rate(
                product_rate=5, category_rate=12, policy=self.policy()
            ),
            5.0,
        )

    def test_category_rate_applies_when_the_product_has_none(self):
        self.assertEqual(
            resolve_gst_rate(
                product_rate=None, category_rate=12, policy=self.policy()
            ),
            12.0,
        )

    def test_store_default_applies_when_nothing_else_is_set(self):
        self.assertEqual(resolve_gst_rate(policy=self.policy()), 18.0)

    def test_explicit_zero_on_the_product_is_not_unset(self):
        # The whole point: exempt goods must stay exempt even when the category
        # and store both carry a rate.
        self.assertEqual(
            resolve_gst_rate(product_rate=0, category_rate=18, policy=self.policy()),
            0.0,
        )
        self.assertEqual(
            resolve_gst_rate(product_rate=0.0, category_rate=18, policy=self.policy()),
            0.0,
        )

    def test_explicit_zero_on_the_category_is_not_unset(self):
        self.assertEqual(
            resolve_gst_rate(product_rate=None, category_rate=0, policy=self.policy()),
            0.0,
        )

    def test_composition_store_ignores_every_configured_rate(self):
        self.assertEqual(
            resolve_gst_rate(
                product_rate=18,
                category_rate=18,
                policy=self.policy(compositionScheme=True),
            ),
            0.0,
        )

    def test_invalid_configured_rate_falls_through_to_the_next_source(self):
        self.assertEqual(
            resolve_gst_rate(product_rate=7, category_rate=12, policy=self.policy()),
            12.0,
        )

    def test_no_policy_at_all_yields_zero(self):
        self.assertEqual(resolve_gst_rate(product_rate=None), 0.0)

    def test_resolved_rate_flows_into_a_calculation(self):
        policy = self.policy()
        rate = resolve_gst_rate(product_rate=None, category_rate=12, policy=policy)
        result = compute_tax(
            [line(112.0, rate=rate)], policy=policy, place_of_supply="Karnataka"
        )

        self.assertEqual(result.lines[0].gst_rate, 12.0)
        self.assertEqual(result.total_taxable_value, 100.0)
        self.assertEqual(result.total_tax, 12.0)


if __name__ == "__main__":
    unittest.main()
