import copy
import importlib
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from bson import ObjectId
from pymongo import ReturnDocument

from tests.mongo_fakes import FakeDatabase

backfill = importlib.import_module("app.migrations.0001_backfill_order_numbers")

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _order(db, tenant, minutes, number=None, **extra):
    doc = {"_id": ObjectId(), "tenantId": tenant, "createdAt": T0 + timedelta(minutes=minutes), **extra}
    if number is not None:
        doc["orderNumber"] = number
    db["orders"].insert_one(doc)
    return doc["_id"]


def _number(db, order_id):
    return db["orders"].find_one({"_id": order_id}).get("orderNumber")


def _new_order(db, tenant, find_one_and_update=None):
    """What order_fulfillment.next_order_number + insert does."""
    find_one_and_update = find_one_and_update or db["counters"].find_one_and_update
    seq = find_one_and_update(
        {"_id": f"orders:{tenant}"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )["seq"]
    return _order(db, tenant, 10_000, number=seq)


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.log = []

    def _up(self, **kwargs):
        return backfill.up(self.db, log=self.log.append, **kwargs)

    def test_unnumbered_store_gets_one_to_n_in_created_order(self):
        late = _order(self.db, "s1", 30)
        early = _order(self.db, "s1", 10)
        middle = _order(self.db, "s1", 20)
        summary = self._up()
        self.assertEqual([_number(self.db, i) for i in (early, middle, late)], [1, 2, 3])
        self.assertEqual(self.db["counters"].find_one({"_id": "orders:s1"})["seq"], 3)
        self.assertEqual(summary["ordersNumbered"], 3)
        self.assertIsNotNone(self.db["orders"].find_one({"_id": early}).get("orderNumberBackfilledAt"))

    def test_store_with_new_numbered_orders_keeps_them_and_numbers_old_after_counter(self):
        old_a = _order(self.db, "s1", 1)
        old_b = _order(self.db, "s1", 2)
        new_1 = _new_order(self.db, "s1")
        new_2 = _new_order(self.db, "s1")
        self._up()
        self.assertEqual(_number(self.db, new_1), 1)
        self.assertEqual(_number(self.db, new_2), 2)
        self.assertEqual([_number(self.db, old_a), _number(self.db, old_b)], [3, 4])
        self.assertIsNone(self.db["orders"].find_one({"_id": new_1}).get("orderNumberBackfilledAt"))
        # The app continues after the reserved block.
        self.assertEqual(_number(self.db, _new_order(self.db, "s1")), 5)

    def test_counter_behind_existing_numbers_is_raised_first(self):
        _order(self.db, "s1", 5, number=7)  # restored without its counter doc
        old = _order(self.db, "s1", 1)
        self._up()
        self.assertEqual(_number(self.db, old), 8)
        self.assertEqual(self.db["counters"].find_one({"_id": "orders:s1"})["seq"], 8)

    def test_stores_are_numbered_independently(self):
        a = _order(self.db, "s1", 1)
        b = _order(self.db, "s2", 1)
        _new_order(self.db, "s2")
        self._up()
        self.assertEqual(_number(self.db, a), 1)
        self.assertEqual(_number(self.db, b), 2)

    def test_ties_and_missing_created_at(self):
        first_id, second_id = sorted([ObjectId(), ObjectId()], key=lambda o: o.binary)
        self.db["orders"].insert_one({"_id": second_id, "tenantId": "s1", "createdAt": T0})
        self.db["orders"].insert_one({"_id": first_id, "tenantId": "s1", "createdAt": T0})
        no_date = ObjectId.from_datetime(T0 + timedelta(days=1))
        self.db["orders"].insert_one({"_id": no_date, "tenantId": "s1"})
        naive = _order(self.db, "s1", 0)
        self.db["orders"].update_one({"_id": naive}, {"$set": {"createdAt": datetime(2025, 12, 31)}})
        self._up()
        self.assertEqual(
            [_number(self.db, i) for i in (naive, first_id, second_id, no_date)], [1, 2, 3, 4]
        )

    def test_concurrent_new_orders_never_collide(self):
        for minute in range(5):
            _order(self.db, "s1", minute)
        _new_order(self.db, "s1")
        counters = self.db["counters"]
        real = counters.find_one_and_update
        db = self.db

        def racing(query, update, **kwargs):
            _new_order(db, "s1", real)  # lands just before the reservation
            result = real(query, update, **kwargs)
            _new_order(db, "s1", real)  # and one right after it
            return result

        with patch.object(counters, "find_one_and_update", racing):
            self._up()
        numbers = [d["orderNumber"] for d in self.db["orders"].find({"tenantId": "s1"})]
        self.assertEqual(len(numbers), 8)
        self.assertEqual(len(set(numbers)), 8)
        self.assertEqual(sorted(numbers), list(range(1, 9)))

    def test_idempotent(self):
        _order(self.db, "s1", 1)
        _order(self.db, "s1", 2)
        self._up()
        state = copy.deepcopy(self.db["orders"].docs), copy.deepcopy(self.db["counters"].docs)
        summary = self._up()
        self.assertEqual(summary["ordersNumbered"], 0)
        self.assertEqual((self.db["orders"].docs, self.db["counters"].docs), state)

    def test_numbered_meanwhile_is_skipped_not_overwritten(self):
        target = _order(self.db, "s1", 1)
        orders = self.db["orders"]
        real = orders.update_one
        db = self.db

        def sneaky(query, update, **kwargs):
            if query.get("_id") == target and "orderNumber" in query:
                real({"_id": target}, {"$set": {"orderNumber": 99}})
            return real(query, update, **kwargs)

        with patch.object(orders, "update_one", sneaky):
            summary = self._up()
        self.assertEqual(_number(db, target), 99)
        self.assertEqual(summary["tenants"][0]["skipped"], 1)

    def test_orders_without_tenant_are_left_alone(self):
        orphan = ObjectId()
        self.db["orders"].insert_one({"_id": orphan, "createdAt": T0})
        summary = self._up()
        self.assertIsNone(_number(self.db, orphan))
        self.assertEqual(summary["ordersWithoutTenant"], 1)

    def test_ledger_entries_get_order_number(self):
        old = _order(self.db, "s1", 1)
        new = _new_order(self.db, "s1")
        ledger = self.db["ledger_entries"]
        ledger.insert_one({"_id": ObjectId(), "tenantId": "s1", "orderId": old})
        ledger.insert_one({"_id": ObjectId(), "tenantId": "s1", "orderId": str(new)})
        kept = ledger.insert_one({"_id": ObjectId(), "tenantId": "s1", "orderId": new, "orderNumber": 1}).inserted_id
        dangling = ledger.insert_one({"_id": ObjectId(), "tenantId": "s1", "orderId": ObjectId()}).inserted_id
        summary = self._up()
        numbers = {str(e["orderId"]): e.get("orderNumber") for e in ledger.find({})}
        self.assertEqual(numbers[str(old)], 2)
        self.assertEqual(numbers[str(new)], 1)
        self.assertEqual(ledger.find_one({"_id": kept})["orderNumber"], 1)
        self.assertIsNone(ledger.find_one({"_id": dangling}).get("orderNumber"))
        self.assertEqual(summary["ledgerUpdated"], 2)

    def test_dry_run_reports_per_store_and_writes_nothing(self):
        _order(self.db, "s1", 1)
        _order(self.db, "s1", 2)
        old = _order(self.db, "s2", 1)
        _new_order(self.db, "s2")
        self.db["ledger_entries"].insert_one({"_id": ObjectId(), "tenantId": "s2", "orderId": old})
        before = {name: copy.deepcopy(self.db[name].docs) for name in ("orders", "counters", "ledger_entries")}
        summary = self._up(dry_run=True)
        after = {name: self.db[name].docs for name in before}
        self.assertEqual(after, before)
        self.assertTrue(summary["dryRun"])
        text = "\n".join(self.log)
        self.assertIn("s1: would number 2 order(s) as 1..2", text)
        self.assertIn("s2: would number 1 order(s) as 2..2", text)
        self.assertIn("ledger s2: would set orderNumber on 1 of 1 entries", text)


class CounterCompatibilityTests(unittest.TestCase):
    def test_counter_id_matches_next_order_number(self):
        # Checked statically: importing order_fulfillment would open a client
        # to the configured (production) MONGO_URI.
        source = (
            Path(__file__).resolve().parent.parent / "app" / "services" / "order_fulfillment.py"
        ).read_text(encoding="utf-8")
        self.assertIn('{"_id": f"orders:{tenant_id}"}', source)
        self.assertEqual(backfill.counter_id("s1"), "orders:s1")


if __name__ == "__main__":
    unittest.main()
