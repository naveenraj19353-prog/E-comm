import unittest
from unittest.mock import patch

from bson import ObjectId

from app.services import order_fulfillment


class FakeCounters:
    def __init__(self):
        self.docs = {}

    def find_one_and_update(self, query, update, upsert, return_document):
        key = query["_id"]
        current = self.docs.get(key, {"seq": 0})
        current["seq"] += update["$inc"]["seq"]
        self.docs[key] = current
        return dict(current)


class FakeOrders:
    def insert_one(self, doc):
        doc["_id"] = ObjectId()

        class _Result:
            inserted_id = doc["_id"]

        return _Result()


class NextOrderNumberTests(unittest.TestCase):
    def test_starts_at_one_and_increments_per_tenant(self):
        fake = FakeCounters()
        with patch.object(order_fulfillment, "counters", fake):
            self.assertEqual(order_fulfillment.next_order_number("store-1"), 1)
            self.assertEqual(order_fulfillment.next_order_number("store-1"), 2)
            self.assertEqual(order_fulfillment.next_order_number("store-2"), 1)

    def test_insert_order_assigns_a_sequential_number(self):
        fake_counters = FakeCounters()
        with patch.object(order_fulfillment, "counters", fake_counters), patch.object(
            order_fulfillment, "orders", FakeOrders()
        ):
            doc1, _ = order_fulfillment._insert_order({"tenantId": "store-1"})
            doc2, _ = order_fulfillment._insert_order({"tenantId": "store-1"})
        self.assertEqual(doc1["orderNumber"], 1)
        self.assertEqual(doc2["orderNumber"], 2)


class OrderNumberDisplayTests(unittest.TestCase):
    def test_formats_sequential_number(self):
        from app.services.whatsapp_notification_service import _order_number

        self.assertEqual(_order_number({"orderNumber": 42}), "RC-10042")

    def test_falls_back_to_id_suffix_for_old_orders(self):
        from app.services.whatsapp_notification_service import _order_number

        order_id = ObjectId()
        result = _order_number({"_id": order_id})
        self.assertEqual(result, str(order_id)[-8:].upper())


if __name__ == "__main__":
    unittest.main()
