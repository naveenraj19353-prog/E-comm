import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.services import ledger_service


class FakeCollection:
    """Minimal find/find_one/insert_one/update_one/count_documents/aggregate fake."""

    def __init__(self, docs=None):
        self.docs = list(docs or [])

    @staticmethod
    def _matches(doc, query):
        for key, expected in query.items():
            if isinstance(expected, dict) and "$regex" in expected:
                flags = re.IGNORECASE if "i" in (expected.get("$options") or "") else 0
                if not re.match(expected["$regex"], str(doc.get(key, "")), flags):
                    return False
                continue
            if isinstance(expected, dict) and "$ne" in expected:
                if doc.get(key) == expected["$ne"]:
                    return False
                continue
            if isinstance(expected, dict) and "$in" in expected:
                if doc.get(key) not in expected["$in"]:
                    return False
                continue
            if isinstance(expected, dict) and ("$gte" in expected or "$lte" in expected):
                value = doc.get(key)
                if "$gte" in expected and (value is None or value < expected["$gte"]):
                    return False
                if "$lte" in expected and (value is None or value > expected["$lte"]):
                    return False
                continue
            if doc.get(key) != expected:
                return False
        return True

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([dict(d) for d in self.docs if self._matches(d, query)])

    def count_documents(self, query):
        return len([d for d in self.docs if self._matches(d, query)])

    def insert_one(self, doc):
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        for existing in self.docs:
            if existing.get("orderId") is not None and existing.get(
                "orderId"
            ) == doc.get("orderId"):
                from pymongo.errors import DuplicateKeyError

                raise DuplicateKeyError("duplicate orderId")
        self.docs.append(doc)

        class _Result:
            inserted_id = doc["_id"]

        return _Result()

    def update_one(self, query, update):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                for field in update.get("$unset", {}):
                    doc.pop(field, None)

                class _Result:
                    matched_count = 1

                return _Result()

        class _Result:
            matched_count = 0

        return _Result()

    def update_many(self, query, update):
        matched = 0
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                matched += 1

        class _Result:
            pass

        _Result.matched_count = matched
        return _Result()

    def aggregate(self, pipeline):
        match = pipeline[0]["$match"]
        matching = [d for d in self.docs if self._matches(d, match)]
        group = pipeline[1]["$group"]
        result = {}
        for key, spec in group.items():
            if key == "_id":
                continue
            field = spec["$sum"].lstrip("$")
            result[key] = sum(float(d.get(field) or 0) for d in matching)
        return iter([result] if matching else [result])


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class EffectiveCommissionTests(unittest.TestCase):
    def test_uses_platform_default_when_tenant_has_no_override(self):
        with patch.object(ledger_service, "PLATFORM_DEFAULT_COMMISSION_PERCENT", 5.0):
            self.assertEqual(ledger_service.effective_commission_percent({}), 5.0)
            self.assertEqual(ledger_service.effective_commission_percent(None), 5.0)

    def test_uses_tenant_override_when_present(self):
        tenant = {"platformCommissionPercent": 3.5}
        self.assertEqual(ledger_service.effective_commission_percent(tenant), 3.5)


class RecordOrderLedgerEntryTests(unittest.TestCase):
    def setUp(self):
        self.order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "razorpayPaymentId": "pay_123",
            "totalAmount": 1000.0,
        }
        self.tenants = FakeCollection([{"tenantId": "store-1"}])
        self.ledger_entries = FakeCollection()

    def test_cod_orders_are_skipped(self):
        order = {**self.order, "razorpayPaymentId": None}
        with patch.object(ledger_service, "ledger_entries", self.ledger_entries):
            ledger_service.record_order_ledger_entry(order)
        self.assertEqual(self.ledger_entries.docs, [])

    def test_starts_with_no_delivery_charge_and_unsettled(self):
        with patch.object(ledger_service, "tenants", self.tenants), patch.object(
            ledger_service, "ledger_entries", self.ledger_entries
        ), patch.object(
            ledger_service, "_gateway_fee_for_payment", return_value=20.0
        ), patch.object(
            ledger_service, "PLATFORM_DEFAULT_COMMISSION_PERCENT", 5.0
        ):
            ledger_service.record_order_ledger_entry(self.order)

        entry = self.ledger_entries.docs[0]
        self.assertEqual(entry["grossAmount"], 1000.0)
        self.assertEqual(entry["commissionAmount"], 50.0)  # 5% of 1000
        self.assertEqual(entry["gatewayFee"], 20.0)
        self.assertEqual(entry["deliveryCharge"], 0.0)
        self.assertFalse(entry["deliveryChargeSynced"])
        self.assertEqual(entry["netAmount"], 930.0)  # delivery charge not known yet
        self.assertEqual(entry["status"], "pending")
        self.assertFalse(entry["settled"])

    def test_duplicate_order_does_not_raise(self):
        with patch.object(ledger_service, "tenants", self.tenants), patch.object(
            ledger_service, "ledger_entries", self.ledger_entries
        ), patch.object(ledger_service, "_gateway_fee_for_payment", return_value=0.0):
            ledger_service.record_order_ledger_entry(self.order)
            ledger_service.record_order_ledger_entry(self.order)
        self.assertEqual(len(self.ledger_entries.docs), 1)


class SyncDeliveryChargeTests(unittest.TestCase):
    def setUp(self):
        self.order_id = ObjectId()
        self.entry = {
            "_id": ObjectId(),
            "orderId": self.order_id,
            "tenantId": "store-1",
            "grossAmount": 1000.0,
            "commissionAmount": 50.0,
            "gatewayFee": 20.0,
            "deliveryCharge": 0.0,
            "deliveryChargeSynced": False,
            "netAmount": 930.0,
            "settled": False,
        }
        self.ledger_entries = FakeCollection([dict(self.entry)])
        self.shipments = FakeCollection(
            [
                {
                    "tenantId": "store-1",
                    "orderId": str(self.order_id),
                    "provider": "delhivery",
                    "awb": "AWB123",
                }
            ]
        )

    def test_applies_real_charge_and_recomputes_net(self):
        with patch.object(ledger_service, "ledger_entries", self.ledger_entries), patch.object(
            ledger_service, "shipments", self.shipments
        ), patch(
            "app.services.delhivery_service.DelhiveryService.fetch_shipment_charges",
            return_value=60.0,
        ):
            updated = ledger_service.sync_delivery_charge_for_order(
                self.order_id, "store-1"
            )
        self.assertTrue(updated)
        entry = self.ledger_entries.docs[0]
        self.assertEqual(entry["deliveryCharge"], 60.0)
        self.assertTrue(entry["deliveryChargeSynced"])
        self.assertEqual(entry["netAmount"], 870.0)  # 1000 - 50 - 20 - 60

    def test_wrong_tenant_cannot_sync_another_stores_order(self):
        with patch.object(ledger_service, "ledger_entries", self.ledger_entries), patch.object(
            ledger_service, "shipments", self.shipments
        ):
            updated = ledger_service.sync_delivery_charge_for_order(
                self.order_id, "store-2"
            )
        self.assertFalse(updated)
        self.assertEqual(self.ledger_entries.docs[0]["deliveryCharge"], 0.0)

    def test_no_shipment_yet_is_a_no_op(self):
        with patch.object(ledger_service, "ledger_entries", self.ledger_entries), patch.object(
            ledger_service, "shipments", FakeCollection()
        ):
            updated = ledger_service.sync_delivery_charge_for_order(
                self.order_id, "store-1"
            )
        self.assertFalse(updated)

    def test_charge_not_finalized_yet_is_a_no_op(self):
        with patch.object(ledger_service, "ledger_entries", self.ledger_entries), patch.object(
            ledger_service, "shipments", self.shipments
        ), patch(
            "app.services.delhivery_service.DelhiveryService.fetch_shipment_charges",
            return_value=None,
        ):
            updated = ledger_service.sync_delivery_charge_for_order(
                self.order_id, "store-1"
            )
        self.assertFalse(updated)

    def test_settled_entry_is_never_touched(self):
        settled_entries = FakeCollection([{**self.entry, "settled": True}])
        with patch.object(ledger_service, "ledger_entries", settled_entries), patch.object(
            ledger_service, "shipments", self.shipments
        ), patch(
            "app.services.delhivery_service.DelhiveryService.fetch_shipment_charges",
            return_value=60.0,
        ):
            updated = ledger_service.sync_delivery_charge_for_order(
                self.order_id, "store-1"
            )
        self.assertFalse(updated)
        self.assertEqual(settled_entries.docs[0]["deliveryCharge"], 0.0)


class RecordOrderRefundTests(unittest.TestCase):
    def test_refund_before_payout_updates_net_in_place(self):
        order_id = ObjectId()
        entries = FakeCollection(
            [
                {
                    "_id": ObjectId(),
                    "orderId": order_id,
                    "tenantId": "store-1",
                    "grossAmount": 1000.0,
                    "refundedAmount": 0.0,
                    "commissionAmount": 50.0,
                    "gatewayFee": 20.0,
                    "deliveryCharge": 60.0,
                    "netAmount": 870.0,
                    "status": "pending",
                    "settled": False,
                }
            ]
        )
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_order_refund(order_id)

        entry = entries.docs[0]
        self.assertEqual(entry["refundedAmount"], 1000.0)
        self.assertEqual(entry["commissionAmount"], 0.0)
        # deliveryCharge (60) - gatewayFee (20): store already paid for the
        # courier and keeps that portion; platform eats its own gateway fee.
        self.assertEqual(entry["netAmount"], 40.0)
        self.assertEqual(entry["status"], "refunded")
        self.assertFalse(entry["settled"])

    def test_refund_after_payout_reopens_only_the_adjustment(self):
        order_id = ObjectId()
        entries = FakeCollection(
            [
                {
                    "_id": ObjectId(),
                    "orderId": order_id,
                    "tenantId": "store-1",
                    "grossAmount": 1000.0,
                    "refundedAmount": 0.0,
                    "commissionAmount": 50.0,
                    "gatewayFee": 20.0,
                    "deliveryCharge": 60.0,
                    "netAmount": 870.0,
                    "settledNetAmount": 870.0,
                    "status": "pending",
                    "settled": True,
                    "payoutId": ObjectId(),
                }
            ]
        )
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_order_refund(order_id)

        entry = entries.docs[0]
        # True net after refund is 40 (60 delivery - 20 fee), but 870 was
        # already paid out, so the store now owes the platform the 830 delta.
        self.assertEqual(entry["netAmount"], -830.0)
        self.assertFalse(entry["settled"])
        self.assertIsNone(entry["payoutId"])

    def test_missing_ledger_entry_is_a_no_op(self):
        entries = FakeCollection()
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_order_refund(ObjectId())  # must not raise


class RecordPartialRefundTests(unittest.TestCase):
    def _entry(self, **overrides):
        entry = {
            "_id": ObjectId(),
            "orderId": ObjectId(),
            "tenantId": "store-1",
            "grossAmount": 1000.0,
            "refundedAmount": 0.0,
            "commissionPercent": 5.0,
            "commissionAmount": 50.0,
            "gatewayFee": 20.0,
            "deliveryCharge": 60.0,
            "netAmount": 870.0,
            "status": "pending",
            "settled": False,
        }
        entry.update(overrides)
        return entry

    def test_partial_refund_reduces_commission_and_net_proportionally(self):
        entry = self._entry()
        entries = FakeCollection([dict(entry)])
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_partial_refund(entry["orderId"], 200.0)

        updated = entries.docs[0]
        self.assertEqual(updated["refundedAmount"], 200.0)
        # 5% of the 200 refunded is given back: 50 - 10 = 40.
        self.assertEqual(updated["commissionAmount"], 40.0)
        # gatewayFee/deliveryCharge untouched; net drops by (200 - 10) = 190.
        self.assertEqual(updated["netAmount"], 680.0)
        self.assertEqual(updated["gatewayFee"], 20.0)
        self.assertEqual(updated["deliveryCharge"], 60.0)
        self.assertEqual(updated["status"], "pending")

    def test_refund_amount_is_capped_at_remaining_balance(self):
        entry = self._entry(refundedAmount=900.0)
        entries = FakeCollection([dict(entry)])
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_partial_refund(entry["orderId"], 500.0)
        # Only 100 was left to refund, not 500.
        self.assertEqual(entries.docs[0]["refundedAmount"], 1000.0)
        self.assertEqual(entries.docs[0]["status"], "refunded")

    def test_settled_entry_reopens_with_only_the_new_delta(self):
        entry = self._entry(settled=True, settledNetAmount=870.0, payoutId=ObjectId())
        entries = FakeCollection([dict(entry)])
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_partial_refund(entry["orderId"], 200.0)

        updated = entries.docs[0]
        self.assertFalse(updated["settled"])
        self.assertIsNone(updated["payoutId"])
        # Delta only: -(200 - 10) = -190, not a full recompute against 870.
        self.assertEqual(updated["netAmount"], -190.0)

    def test_zero_refund_amount_is_a_no_op(self):
        entry = self._entry(refundedAmount=1000.0)  # nothing left to refund
        entries = FakeCollection([dict(entry)])
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_partial_refund(entry["orderId"], 50.0)
        self.assertEqual(entries.docs[0]["netAmount"], 870.0)  # untouched

    def test_missing_entry_is_a_no_op(self):
        entries = FakeCollection()
        with patch.object(ledger_service, "ledger_entries", entries):
            ledger_service.record_partial_refund(ObjectId(), 50.0)  # must not raise


class StatementAndPayoutTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.old_entry = {
            "_id": ObjectId(),
            "orderId": ObjectId(),
            "tenantId": "store-1",
            "grossAmount": 500.0,
            "refundedAmount": 0.0,
            "commissionAmount": 25.0,
            "gatewayFee": 10.0,
            "deliveryCharge": 0.0,
            "netAmount": 465.0,
            "status": "pending",
            "settled": False,
            "createdAt": now - timedelta(days=10),
        }
        self.new_entry = {
            "_id": ObjectId(),
            "orderId": ObjectId(),
            "tenantId": "store-1",
            "grossAmount": 1000.0,
            "refundedAmount": 0.0,
            "commissionAmount": 50.0,
            "gatewayFee": 20.0,
            "deliveryCharge": 0.0,
            "netAmount": 930.0,
            "status": "pending",
            "settled": False,
            "createdAt": now,
        }
        self.entries = FakeCollection([dict(self.old_entry), dict(self.new_entry)])
        self.now = now

    def test_balance_due_is_sum_of_unsettled_entries(self):
        with patch.object(ledger_service, "ledger_entries", self.entries), patch.object(
            ledger_service, "orders", FakeCollection()
        ):
            statement = ledger_service.get_statement("store-1")
        self.assertEqual(statement["summary"]["netAmount"], 1395.0)
        self.assertEqual(statement["summary"]["balanceDue"], 1395.0)
        self.assertEqual(statement["summary"]["totalPaidOut"], 0.0)
        self.assertEqual(statement["total"], 2)

    def test_date_filter_scopes_summary_and_entries(self):
        with patch.object(ledger_service, "ledger_entries", self.entries), patch.object(
            ledger_service, "orders", FakeCollection()
        ):
            statement = ledger_service.get_statement(
                "store-1", from_date=self.now - timedelta(days=1)
            )
        self.assertEqual(statement["total"], 1)
        self.assertEqual(statement["summary"]["netAmount"], 930.0)


class RecordPayoutTests(unittest.TestCase):
    def setUp(self):
        self.entries = FakeCollection(
            [
                {
                    "_id": ObjectId(),
                    "orderId": ObjectId(),
                    "tenantId": "store-1",
                    "netAmount": 465.0,
                    "settled": False,
                },
                {
                    "_id": ObjectId(),
                    "orderId": ObjectId(),
                    "tenantId": "store-1",
                    "netAmount": 930.0,
                    "settled": False,
                },
            ]
        )
        self.payouts = FakeCollection()

    def test_settles_all_unsettled_entries_and_sums_amount(self):
        with patch.object(ledger_service, "ledger_entries", self.entries), patch.object(
            ledger_service, "payouts", self.payouts
        ):
            payout = ledger_service.record_payout("store-1", "note", "admin-1")

        self.assertEqual(payout["amount"], 1395.0)
        self.assertEqual(payout["entryCount"], 2)
        for entry in self.entries.docs:
            self.assertTrue(entry["settled"])
            self.assertEqual(entry["settledNetAmount"], entry["netAmount"])
            self.assertIsNotNone(entry["payoutId"])

    def test_settling_twice_finds_nothing_the_second_time(self):
        with patch.object(ledger_service, "ledger_entries", self.entries), patch.object(
            ledger_service, "payouts", self.payouts
        ):
            ledger_service.record_payout("store-1", None, "admin-1")
            with self.assertRaises(HTTPException) as context:
                ledger_service.record_payout("store-1", None, "admin-1")
        self.assertEqual(context.exception.status_code, 400)


class SetTenantCommissionTests(unittest.TestCase):
    def test_rejects_out_of_range_percent(self):
        with self.assertRaises(HTTPException):
            ledger_service.set_tenant_commission("store-1", 150)

    def test_missing_tenant_raises_404(self):
        with patch.object(ledger_service, "tenants", FakeCollection()):
            with self.assertRaises(HTTPException) as context:
                ledger_service.set_tenant_commission("store-1", 3.5)
        self.assertEqual(context.exception.status_code, 404)

    def test_sets_override_on_existing_tenant(self):
        tenants = FakeCollection([{"tenantId": "store-1"}])
        with patch.object(ledger_service, "tenants", tenants):
            ledger_service.set_tenant_commission("store-1", 3.5)
        self.assertEqual(tenants.docs[0]["platformCommissionPercent"], 3.5)

    def test_clearing_override_unsets_the_field(self):
        tenants = FakeCollection([{"tenantId": "store-1", "platformCommissionPercent": 3.5}])
        with patch.object(ledger_service, "tenants", tenants):
            ledger_service.set_tenant_commission("store-1", None)
        self.assertNotIn("platformCommissionPercent", tenants.docs[0])


if __name__ == "__main__":
    unittest.main()
