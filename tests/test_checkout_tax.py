"""Tests for the cart -> GST bridge.

Stdlib-only: ``checkout_tax`` reaches for Mongo only inside the functions that
load data, and those take injected rates here, so no database is needed.
"""

import unittest

from app.services.checkout_tax import (
    allocate_discount,
    build_taxable_lines,
    compute_checkout_tax,
    tax_summary,
)
from app.services.tax_service import TaxPolicy


def item(
    price,
    quantity=1,
    *,
    gst_rate=None,
    category_id="cat-1",
    hsn_code=None,
    name="Item",
):
    return {
        "price": price,
        "quantity": quantity,
        "subtotal": round(price * quantity, 2),
        "gstRate": gst_rate,
        "categoryId": category_id,
        "hsnCode": hsn_code,
        "name": name,
    }


def policy(**overrides):
    settings = {"defaultGstRate": 18.0}
    settings.update(overrides)
    return TaxPolicy.from_tenant({"tax": settings})


class DiscountAllocationTests(unittest.TestCase):
    def test_spreads_discount_in_proportion_to_line_value(self):
        items = [item(100.0), item(300.0)]

        self.assertEqual(allocate_discount(items, 40.0), [10.0, 30.0])

    def test_parts_always_readd_to_the_whole(self):
        # Two lines of a third each cannot split 10.00 exactly; the remainder
        # must still land somewhere or tax would be computed on the wrong total.
        items = [item(10.0), item(10.0), item(10.0)]

        shares = allocate_discount(items, 10.0)

        self.assertAlmostEqual(sum(shares), 10.0, places=2)

    def test_no_discount_or_no_lines(self):
        self.assertEqual(allocate_discount([item(100.0)], 0), [0.0])
        self.assertEqual(allocate_discount([], 50.0), [])

    def test_discount_cannot_exceed_the_cart(self):
        self.assertEqual(allocate_discount([item(100.0)], 500.0), [100.0])

    def test_negative_discount_is_ignored(self):
        self.assertEqual(allocate_discount([item(100.0)], -25.0), [0.0])


class RateResolutionTests(unittest.TestCase):
    def test_product_rate_wins_over_category_and_default(self):
        lines = build_taxable_lines(
            [item(100.0, gst_rate=5)],
            policy=policy(),
            category_rates={"cat-1": 12},
        )

        self.assertEqual(lines[0].gst_rate, 5.0)

    def test_category_rate_applies_when_the_product_has_none(self):
        lines = build_taxable_lines(
            [item(100.0)], policy=policy(), category_rates={"cat-1": 12}
        )

        self.assertEqual(lines[0].gst_rate, 12.0)

    def test_store_default_applies_when_nothing_else_is_set(self):
        lines = build_taxable_lines([item(100.0)], policy=policy())

        self.assertEqual(lines[0].gst_rate, 18.0)

    def test_exempt_product_stays_exempt_despite_the_category(self):
        lines = build_taxable_lines(
            [item(100.0, gst_rate=0)], policy=policy(), category_rates={"cat-1": 18}
        )

        self.assertEqual(lines[0].gst_rate, 0.0)

    def test_unknown_category_falls_back_to_the_store_default(self):
        lines = build_taxable_lines(
            [item(100.0, category_id="missing")],
            policy=policy(),
            category_rates={"cat-1": 12},
        )

        self.assertEqual(lines[0].gst_rate, 18.0)

    def test_hsn_code_is_carried_through(self):
        lines = build_taxable_lines(
            [item(100.0, hsn_code="9004")], policy=policy()
        )

        self.assertEqual(lines[0].hsn_code, "9004")


class ComputeCheckoutTaxTests(unittest.TestCase):
    """The headline case from the payout flow: a 39,990 cart at 18%."""

    def test_inclusive_cart_keeps_the_payable_and_splits_out_the_tax(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(39990.0)],
            policy=policy(pricesIncludeTax=True),
            category_rates={},
            place_of_supply="Karnataka",
            shipping=0.0,
        )

        # The customer pays exactly what the store priced.
        self.assertAlmostEqual(breakdown.payable, 39990.0, places=2)
        self.assertEqual(breakdown.grand_total, 39990.0)
        self.assertAlmostEqual(breakdown.total_tax, 6100.17, places=2)
        self.assertAlmostEqual(breakdown.total_taxable_value, 33889.83, places=2)

    def test_intra_state_splits_into_cgst_and_sgst(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(11800.0)],
            policy=policy(stateCode="29"),
            category_rates={},
            place_of_supply="Karnataka",
        )

        self.assertFalse(breakdown.inter_state)
        self.assertEqual(breakdown.igst_total, 0.0)
        # The halves must re-add to the tax exactly.
        self.assertAlmostEqual(
            breakdown.cgst_total + breakdown.sgst_total,
            breakdown.total_tax,
            places=2,
        )

    def test_inter_state_charges_igst_only(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(11800.0)],
            policy=policy(stateCode="29"),
            category_rates={},
            place_of_supply="Maharashtra",
        )

        self.assertTrue(breakdown.inter_state)
        self.assertEqual(breakdown.cgst_total, 0.0)
        self.assertEqual(breakdown.sgst_total, 0.0)
        self.assertAlmostEqual(breakdown.igst_total, breakdown.total_tax, places=2)

    def test_exclusive_pricing_adds_tax_on_top(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(100.0)],
            policy=policy(pricesIncludeTax=False),
            category_rates={},
            place_of_supply="Karnataka",
        )

        self.assertAlmostEqual(breakdown.total_taxable_value, 100.0, places=2)
        self.assertAlmostEqual(breakdown.total_tax, 18.0, places=2)
        self.assertAlmostEqual(breakdown.grand_total, 118.0, places=2)

    def test_coupon_discount_lands_on_the_lines_and_reduces_the_tax(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(11800.0)],
            discount=1180.0,
            policy=policy(),
            category_rates={},
            place_of_supply="Karnataka",
        )

        # 11,800 less 1,180 = 10,620 inclusive at 18%.
        self.assertAlmostEqual(breakdown.payable, 10620.0, places=2)
        self.assertAlmostEqual(breakdown.total_tax, 1620.0, places=2)

    def test_a_cart_with_no_tax_configured_charges_nothing_extra(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(500.0)],
            policy=TaxPolicy.from_tenant({}),
            category_rates={},
            place_of_supply="Karnataka",
        )

        self.assertEqual(breakdown.total_tax, 0.0)
        self.assertAlmostEqual(breakdown.grand_total, 500.0, places=2)

    def test_shipping_is_taxed_when_the_store_says_it_is(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(11800.0)],
            shipping=118.0,
            policy=policy(freightTaxable=True),
            category_rates={},
            place_of_supply="Karnataka",
        )

        self.assertTrue(breakdown.shipping_taxable)
        self.assertAlmostEqual(breakdown.shipping_tax, 18.0, places=2)

    def test_unresolvable_place_of_supply_falls_back_to_the_seller_state(self):
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=[item(11800.0)],
            policy=policy(stateCode="29"),
            category_rates={},
            place_of_supply=None,
        )

        self.assertTrue(breakdown.assumed_seller_state)
        self.assertFalse(breakdown.inter_state)


class TaxSummaryTests(unittest.TestCase):
    def test_lines_line_up_with_the_cart(self):
        items = [item(11800.0, name="First"), item(2360.0, name="Second")]
        breakdown = compute_checkout_tax(
            tenant_id="t1",
            items=items,
            policy=policy(),
            category_rates={},
            place_of_supply="Karnataka",
        )

        summary = tax_summary(breakdown)

        self.assertEqual([line["name"] for line in summary["lines"]], ["First", "Second"])
        self.assertEqual(summary["rateWise"][0]["rate"], 18.0)
        self.assertIn("taxInclusive", summary)


if __name__ == "__main__":
    unittest.main()
