import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.services.stock_movements import (
    StockAdjustmentError,
    build_movement,
    inventory_changes,
    record_movements,
    serialize_movement,
    validate_adjustment,
)

NOW = datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc)


def _product():
    return {
        "_id": ObjectId(),
        "tenantId": "store-a",
        "name": "Cotton Tee",
        "inventory": [
            {"variantId": "black-m", "color": "Black", "size": "M", "stock": 5},
            {"variantId": "black-l", "color": "Black", "size": "L", "stock": 0},
        ],
    }


class ValidateAdjustmentTests(unittest.TestCase):
    def test_valid_adjustment(self):
        self.assertEqual(validate_adjustment(5, "received", "  PO-12 "), (5, "received", "PO-12"))
        self.assertEqual(validate_adjustment(-2, "damaged", None), (-2, "damaged", ""))

    def test_rejects_zero_bad_reason_and_huge_numbers(self):
        for change, reason, note in [
            (0, "received", ""),
            (3, "because", ""),
            (1_000_001, "received", ""),
            (True, "received", ""),
        ]:
            with self.assertRaises(StockAdjustmentError):
                validate_adjustment(change, reason, note)

    def test_other_needs_a_note(self):
        with self.assertRaises(StockAdjustmentError):
            validate_adjustment(1, "other", "  ")
        self.assertEqual(validate_adjustment(1, "other", "gift")[2], "gift")

    def test_note_is_capped(self):
        self.assertEqual(len(validate_adjustment(1, "received", "x" * 500)[2]), 200)


class InventoryChangesTests(unittest.TestCase):
    def test_changed_added_and_removed_variants(self):
        old = [
            {"variantId": "a", "stock": 5},
            {"variantId": "b", "stock": 2},
            {"variantId": "gone", "stock": 4},
        ]
        new = [
            {"variantId": "a", "stock": 8},
            {"variantId": "b", "stock": 2},
            {"variantId": "new", "stock": 3, "color": "Red", "size": "S"},
        ]
        changes = {c["variantId"]: c for c in inventory_changes(old, new)}
        self.assertEqual(set(changes), {"a", "gone", "new"})
        self.assertEqual(changes["a"]["change"], 3)
        self.assertEqual(changes["gone"]["change"], -4)
        self.assertEqual(changes["gone"]["stockAfter"], 0)
        self.assertEqual((changes["new"]["change"], changes["new"]["color"]), (3, "Red"))

    def test_no_changes(self):
        self.assertEqual(inventory_changes([{"variantId": "a", "stock": 1}], [{"variantId": "a", "stock": 1}]), [])


class MovementDocTests(unittest.TestCase):
    def test_build_and_serialize(self):
        product = _product()
        user = {"userId": "u1", "name": "Owner", "role": "admin"}
        doc = build_movement(
            tenant_id="store-a",
            product=product,
            variant_id="black-m",
            change=-2,
            source="manual_adjustment",
            stock_after=3,
            reason="damaged",
            note="torn",
            user=user,
            now=NOW,
        )
        self.assertEqual(doc["color"], "Black")
        self.assertEqual(doc["userName"], "Owner")
        self.assertEqual(doc["source"], "manual_adjustment")
        out = serialize_movement({**doc, "_id": ObjectId()})
        self.assertEqual(out["reasonLabel"], "Damaged")
        self.assertEqual(out["change"], -2)
        self.assertEqual(out["createdAt"], NOW.isoformat())

    def test_unknown_source_is_stored_as_other(self):
        doc = build_movement(
            tenant_id="store-a", product=_product(), variant_id="x", change=1,
            source="mystery", stock_after=None, now=NOW,
        )
        self.assertEqual(doc["source"], "other")

    def test_record_never_raises(self):
        collection = MagicMock()
        collection.insert_many.side_effect = RuntimeError("db down")
        record_movements(collection, [{"a": 1}])  # must not raise
        record_movements(collection, [])
        self.assertEqual(collection.insert_many.call_count, 1)


class FulfillmentLoggingTests(unittest.TestCase):
    def test_restore_with_source_writes_history(self):
        from app.services import order_fulfillment

        product = _product()
        fake_products = MagicMock()
        fake_products.find_one.return_value = product
        movements = MagicMock()
        fake_products.database = {"stock_movements": movements}
        with patch.object(order_fulfillment, "products", fake_products):
            order_fulfillment.restore_variant_stock(
                product["_id"], "black-m", 2, NOW, source="order_cancelled", order_id="o1"
            )
        rows = movements.insert_many.call_args.args[0]
        self.assertEqual(rows[0]["source"], "order_cancelled")
        self.assertEqual(rows[0]["change"], 2)
        self.assertEqual(rows[0]["orderId"], "o1")

    def test_no_source_means_no_history(self):
        from app.services import order_fulfillment

        fake_products = MagicMock()
        fake_products.find_one.return_value = _product()
        movements = MagicMock()
        fake_products.database = {"stock_movements": movements}
        with patch.object(order_fulfillment, "products", fake_products):
            order_fulfillment.restore_variant_stock(ObjectId(), "black-m", 1, NOW)
        movements.insert_many.assert_not_called()


if __name__ == "__main__":
    unittest.main()
