import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.services import order_fulfillment


def _checkout_data(quantity=1):
    return {
        "items": [
            {
                "productId": str(ObjectId()),
                "variantId": "v1",
                "name": "Shirt",
                "price": 100,
                "quantity": quantity,
                "subtotal": 100 * quantity,
            }
        ]
    }


class ReserveCheckoutStockTests(unittest.TestCase):
    def test_reserves_stock_and_returns_items(self):
        checkout_data = _checkout_data()
        with patch.object(order_fulfillment, "_reserve_stock", return_value=True):
            items = order_fulfillment.reserve_checkout_stock(checkout_data)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["quantity"], 1)

    def test_raises_409_when_stock_unavailable(self):
        checkout_data = _checkout_data()
        with patch.object(order_fulfillment, "_reserve_stock", return_value=False):
            with self.assertRaises(HTTPException) as context:
                order_fulfillment.reserve_checkout_stock(checkout_data)
        self.assertEqual(context.exception.status_code, 409)


class ReleaseReservedStockTests(unittest.TestCase):
    def test_restores_every_item(self):
        items = [
            {"productId": ObjectId(), "variantId": "v1", "quantity": 2},
            {"productId": ObjectId(), "variantId": "v2", "quantity": 1},
        ]
        with patch.object(order_fulfillment, "restore_variant_stock") as mock_restore:
            order_fulfillment.release_reserved_stock(items)
        self.assertEqual(mock_restore.call_count, 2)


class FakePaymentIntents:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):
        def matches(doc):
            if doc.get("status") != query["status"]:
                return False
            if query.get("stockReserved") and not doc.get("stockReserved"):
                return False
            if doc.get("createdAt", datetime.max.replace(tzinfo=timezone.utc)) >= query["createdAt"]["$lt"]:
                return False
            return True

        return _FakeCursor([d for d in self.docs if matches(d)])

    def find_one_and_update(self, query, update):
        for doc in self.docs:
            if doc["_id"] == query["_id"] and doc.get("status") == query["status"]:
                doc.update(update["$set"])
                return dict(doc)
        return None


class _FakeCursor(list):
    def limit(self, n):
        return self[:n]


class ExpireAbandonedPaymentIntentsTests(unittest.TestCase):
    def test_expires_stale_intents_and_restores_stock(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=60)
        intent = {
            "_id": ObjectId(),
            "status": "pending",
            "stockReserved": True,
            "createdAt": old,
            "reservedItems": [
                {"productId": ObjectId(), "variantId": "v1", "quantity": 1}
            ],
        }
        fake_intents = FakePaymentIntents([intent])
        with patch.object(order_fulfillment, "payment_intents", fake_intents), patch.object(
            order_fulfillment, "restore_variant_stock"
        ) as mock_restore:
            count = order_fulfillment.expire_abandoned_payment_intents()
        self.assertEqual(count, 1)
        mock_restore.assert_called_once()
        self.assertEqual(intent["status"], "expired")

    def test_recent_intents_are_left_alone(self):
        recent = datetime.now(timezone.utc)
        intent = {
            "_id": ObjectId(),
            "status": "pending",
            "stockReserved": True,
            "createdAt": recent,
            "reservedItems": [],
        }
        fake_intents = FakePaymentIntents([intent])
        with patch.object(order_fulfillment, "payment_intents", fake_intents):
            count = order_fulfillment.expire_abandoned_payment_intents()
        self.assertEqual(count, 0)
        self.assertEqual(intent["status"], "pending")

    def test_already_fulfilled_intents_are_ignored(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=60)
        intent = {
            "_id": ObjectId(),
            "status": "fulfilled",
            "stockReserved": True,
            "createdAt": old,
        }
        fake_intents = FakePaymentIntents([intent])
        with patch.object(order_fulfillment, "payment_intents", fake_intents):
            count = order_fulfillment.expire_abandoned_payment_intents()
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
