"""Credit-note tests: reversing GST on returns."""

import unittest

from app.services.tax_reversal import reverse_tax


def order(**overrides):
    document = {
        "totalAmount": 11800.0,
        "subtotal": 11800.0,
        "items": [
            {
                "name": "Frame",
                "price": 11800.0,
                "quantity": 2,
                "subtotal": 11800.0,
                "taxableValue": 10000.0,
                "taxAmount": 1800.0,
            }
        ],
        "tax": {
            "taxInclusive": True,
            "interState": False,
            "taxableValue": 10000.0,
            "totalTax": 1800.0,
            "cess": 0.0,
        },
    }
    document.update(overrides)
    return document


class WholeOrderReversalTests(unittest.TestCase):
    def test_reverses_the_tax_still_outstanding(self):
        result = reverse_tax(
            order(), [{"lineIndex": 0, "quantity": 2}], whole_order=True
        )

        self.assertAlmostEqual(result["taxAmount"], 1800.0, places=2)
        self.assertAlmostEqual(result["taxableValue"], 10000.0, places=2)
        self.assertAlmostEqual(result["cgst"] + result["sgst"], 1800.0, places=2)
        self.assertEqual(result["igst"], 0.0)

    def test_inter_state_order_reverses_as_igst(self):
        result = reverse_tax(
            order(
                tax={
                    "interState": True,
                    "taxableValue": 10000.0,
                    "totalTax": 1800.0,
                    "cess": 0.0,
                }
            ),
            [{"lineIndex": 0, "quantity": 2}],
            whole_order=True,
        )

        self.assertAlmostEqual(result["igst"], 1800.0, places=2)
        self.assertEqual(result["cgst"], 0.0)

    def test_earlier_partial_returns_reduce_what_is_left_to_reverse(self):
        # Half the order was already refunded, so only half the tax is left.
        result = reverse_tax(
            order(),
            [{"lineIndex": 0, "quantity": 1}],
            whole_order=True,
            already_refunded=5900.0,
        )

        self.assertAlmostEqual(result["taxAmount"], 900.0, places=2)

    def test_nothing_left_to_reverse_never_goes_negative(self):
        result = reverse_tax(
            order(),
            [{"lineIndex": 0, "quantity": 2}],
            whole_order=True,
            already_refunded=11800.0,
        )

        self.assertAlmostEqual(result["taxAmount"], 0.0, places=2)


class PartialReversalTests(unittest.TestCase):
    def test_reverses_the_returned_line_share(self):
        result = reverse_tax(
            order(), [{"lineIndex": 0, "quantity": 1}], whole_order=False
        )

        self.assertAlmostEqual(result["taxAmount"], 900.0, places=2)
        self.assertAlmostEqual(result["taxableValue"], 5000.0, places=2)

    def test_two_partial_lines_add_up_to_the_whole(self):
        two_line_order = order(
            totalAmount=23600.0,
            items=[
                {
                    "quantity": 1,
                    "subtotal": 11800.0,
                    "taxableValue": 10000.0,
                    "taxAmount": 1800.0,
                },
                {
                    "quantity": 1,
                    "subtotal": 11800.0,
                    "taxableValue": 10000.0,
                    "taxAmount": 1800.0,
                },
            ],
            tax={
                "interState": False,
                "taxableValue": 20000.0,
                "totalTax": 3600.0,
                "cess": 0.0,
            },
        )

        first = reverse_tax(
            two_line_order, [{"lineIndex": 0, "quantity": 1}], whole_order=False
        )
        second = reverse_tax(
            two_line_order, [{"lineIndex": 1, "quantity": 1}], whole_order=False
        )

        self.assertAlmostEqual(
            first["taxAmount"] + second["taxAmount"], 3600.0, places=2
        )

    def test_cannot_credit_back_more_gst_than_was_collected(self):
        # A line claiming more tax than the order holds must be capped.
        inflated = order(
            items=[
                {
                    "quantity": 1,
                    "subtotal": 11800.0,
                    "taxableValue": 50000.0,
                    "taxAmount": 9000.0,
                }
            ]
        )

        result = reverse_tax(
            inflated, [{"lineIndex": 0, "quantity": 1}], whole_order=False
        )

        self.assertAlmostEqual(result["taxAmount"], 1800.0, places=2)
        self.assertAlmostEqual(result["taxableValue"], 10000.0, places=2)

    def test_cess_is_prorated_with_the_tax(self):
        with_cess = order(
            tax={
                "interState": False,
                "taxableValue": 10000.0,
                "totalTax": 1800.0,
                "cess": 200.0,
            }
        )

        result = reverse_tax(
            with_cess, [{"lineIndex": 0, "quantity": 1}], whole_order=False
        )

        self.assertAlmostEqual(result["cess"], 100.0, places=2)


class EdgeCaseTests(unittest.TestCase):
    def test_an_order_with_no_tax_block_reverses_nothing(self):
        result = reverse_tax(
            {"totalAmount": 500.0, "items": [{"quantity": 1}]},
            [{"lineIndex": 0, "quantity": 1}],
            whole_order=True,
        )

        self.assertEqual(result["taxAmount"], 0.0)
        self.assertEqual(result["taxableValue"], 0.0)

    def test_an_out_of_range_line_index_is_skipped(self):
        result = reverse_tax(
            order(), [{"lineIndex": 9, "quantity": 1}], whole_order=False
        )

        self.assertEqual(result["taxAmount"], 0.0)

    def test_a_zero_quantity_line_reverses_nothing(self):
        result = reverse_tax(
            order(), [{"lineIndex": 0, "quantity": 0}], whole_order=False
        )

        self.assertEqual(result["taxAmount"], 0.0)

    def test_returning_more_than_the_line_held_is_capped(self):
        result = reverse_tax(
            order(), [{"lineIndex": 0, "quantity": 99}], whole_order=False
        )

        self.assertAlmostEqual(result["taxAmount"], 1800.0, places=2)


if __name__ == "__main__":
    unittest.main()
