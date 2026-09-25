import unittest
from unittest.mock import patch

from app.services import low_stock
from app.services.low_stock import (
    DEFAULT_LOW_STOCK_THRESHOLD,
    crossed_threshold,
    low_stock_items,
    low_stock_message,
    low_stock_query,
    maybe_alert_low_stock,
    tenant_threshold,
)

PRODUCT = {
    "_id": "p1",
    "name": "Cotton Tee",
    "inventory": [
        {"variantId": "black-m", "color": "Black", "size": "M", "stock": 4},
        {"variantId": "black-l", "color": "Black", "size": "L", "stock": 0},
        {"variantId": "white-m", "color": "White", "size": "M", "stock": 30},
    ],
}


class ThresholdTests(unittest.TestCase):
    def test_default_and_custom(self):
        self.assertEqual(tenant_threshold(None), DEFAULT_LOW_STOCK_THRESHOLD)
        self.assertEqual(tenant_threshold({}), DEFAULT_LOW_STOCK_THRESHOLD)
        self.assertEqual(tenant_threshold({"lowStockThreshold": 12}), 12)
        self.assertEqual(tenant_threshold({"lowStockThreshold": 0}), 0)
        self.assertEqual(tenant_threshold({"lowStockThreshold": -3}), 0)
        self.assertEqual(tenant_threshold({"lowStockThreshold": "x"}), DEFAULT_LOW_STOCK_THRESHOLD)

    def test_crossing_only_once(self):
        self.assertTrue(crossed_threshold(6, 5, 5))
        self.assertTrue(crossed_threshold(8, 0, 5))
        self.assertFalse(crossed_threshold(5, 4, 5))  # already low
        self.assertFalse(crossed_threshold(9, 6, 5))  # still above
        self.assertFalse(crossed_threshold(6, 5, 0))  # alerts off


class ListTests(unittest.TestCase):
    def test_groups_low_variants_lowest_first(self):
        items = low_stock_items([PRODUCT], 5)
        self.assertEqual(len(items), 1)
        self.assertEqual([v["variantId"] for v in items[0]["variants"]], ["black-l", "black-m"])
        self.assertEqual(items[0]["lowestStock"], 0)

    def test_query_is_store_scoped(self):
        query = low_stock_query("store-a", 5)
        self.assertEqual(query["tenantId"], "store-a")
        self.assertEqual(query["inventory"], {"$elemMatch": {"stock": {"$lte": 5}}})

    def test_message(self):
        text = low_stock_message("Shop", "Cotton Tee", {"color": "Black", "size": "M"}, 3, 5)
        self.assertIn("Cotton Tee (Black / M) is low: 3 left", text)
        self.assertIn("OUT OF STOCK", low_stock_message("Shop", "Tee", {}, 0, 5))


class AlertTests(unittest.TestCase):
    def test_alert_sent_when_crossing(self):
        with patch.object(low_stock, "_send_low_stock_alert") as send:
            started = maybe_alert_low_stock(
                "store-a", PRODUCT, "black-m", 4, -3, {"lowStockThreshold": 5}, run_in_background=False
            )
        self.assertTrue(started)
        args = send.call_args.args
        self.assertEqual((args[0], args[3], args[4]), ("store-a", 4, 5))
        self.assertEqual(args[2]["variantId"], "black-m")

    def test_no_alert_when_adding_stock_or_already_low(self):
        with patch.object(low_stock, "_send_low_stock_alert") as send:
            self.assertFalse(maybe_alert_low_stock("store-a", PRODUCT, "black-m", 7, 3, {}, run_in_background=False))
            self.assertFalse(maybe_alert_low_stock("store-a", PRODUCT, "black-m", 4, -1, {}, run_in_background=False))
            self.assertFalse(maybe_alert_low_stock("store-a", PRODUCT, "black-m", None, -1, {}, run_in_background=False))
        send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
