"""Delhivery shipment status sync — mocked Delhivery, in-memory collections."""

import asyncio
import json
import threading
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from starlette.requests import Request

from app.services import delhivery_service, shipment_sync
from app.services.delhivery_service import (
    DelhiveryError,
    DelhiveryService,
    classify_tracking,
    normalize_tracking_shipment,
)


# ---------------------------------------------------------------- fakes


def _get(doc, dotted):
    value = doc
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            return None, False
        value = value[part]
    return value, True


def _match_value(value, present, cond):
    if isinstance(cond, dict) and any(str(k).startswith("$") for k in cond):
        for op, arg in cond.items():
            if op == "$in" and value not in arg:
                return False
            if op == "$nin" and value in arg:
                return False
            if op == "$ne" and value == arg:
                return False
            if op == "$exists" and bool(present) != bool(arg):
                return False
            if op == "$gte" and not (present and value is not None and value >= arg):
                return False
            if op == "$lte" and not (present and value is not None and value <= arg):
                return False
        return True
    return present and value == cond


def matches(doc, query):
    for key, cond in query.items():
        if key == "$or":
            if not any(matches(doc, sub) for sub in cond):
                return False
            continue
        value, present = _get(doc, key)
        if not _match_value(value, present, cond):
            return False
    return True


def _set(doc, dotted, value):
    parts = dotted.split(".")
    for part in parts[:-1]:
        if not isinstance(doc.get(part), dict):
            doc[part] = {}
        doc = doc[part]
    doc[parts[-1]] = value


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, spec):
        for key, direction in reversed(spec):
            self.docs.sort(
                key=lambda d: (_get(d, key)[0] is not None, _get(d, key)[0] or 0),
                reverse=direction < 0,
            )
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = [dict(d) for d in (docs or [])]
        self.updates = []

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if matches(doc, query):
                return dict(doc)
        return None

    def find(self, query, projection=None):
        return FakeCursor([dict(d) for d in self.docs if matches(d, query)])

    def update_one(self, query, update, upsert=False):
        self.updates.append((query, update))
        for doc in self.docs:
            if matches(doc, query):
                for key, value in (update.get("$set") or {}).items():
                    _set(doc, key, value)
                for key, value in (update.get("$inc") or {}).items():
                    _set(doc, key, (_get(doc, key)[0] or 0) + value)
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        for doc in self.docs:
            if matches(doc, query):
                for key, value in update["$set"].items():
                    _set(doc, key, value)
                return dict(doc)
        if upsert:
            if any(d.get("_id") == query.get("_id") for d in self.docs):
                raise DuplicateKeyError("E11000 duplicate key")
            doc = {"_id": query["_id"], **update["$set"]}
            self.docs.append(doc)
            return dict(doc)
        return None


def _order(**overrides):
    order = {
        "_id": ObjectId(),
        "tenantId": "store-1",
        "orderStatus": "confirmed",
        "paymentMethod": "razorpay",
        "paymentStatus": "paid",
        "courier": {"provider": "delhivery", "waybill": "AWB1"},
    }
    order.update(overrides)
    return order


def _shipment(order, **overrides):
    doc = {
        "_id": ObjectId(),
        "tenantId": order["tenantId"],
        "orderId": str(order["_id"]),
        "provider": "delhivery",
        "awb": "AWB1",
        "status": "ready_for_pickup",
        "createdAt": datetime.now(timezone.utc),
    }
    doc.update(overrides)
    return doc


def _tracking(status, status_type="UD", **extra):
    return {"awb": "AWB1", "status": status, "statusType": status_type, "statusAt": "2026-09-20T10:00:00", **extra}


# ---------------------------------------------------------------- mapping


class ClassifyTrackingTests(unittest.TestCase):
    def test_documented_status_pairs(self):
        cases = [
            (("Manifested", "UD"), "pre_pickup"),
            (("Not Picked", "UD"), "pre_pickup"),
            (("In Transit", "UD"), "in_transit"),
            (("Pending", "UD"), "in_transit"),
            (("Dispatched", "UD"), "in_transit"),
            (("Delivered", "DL"), "delivered"),
            (("RTO", "DL"), "rto_delivered"),
            (("DTO", "DL"), "rto_delivered"),
            (("Returned", None), "rto_delivered"),
            (("In Transit", "RT"), "rto"),
            (("Dispatched", "RT"), "rto"),
            (("RTO In Transit", None), "rto"),
            (("Lost", None), "lost"),
            (("Canceled", "CN"), "cancelled"),
            (("Something New", "UD"), "unknown"),
            ((None, None), "unknown"),
        ]
        for (status, status_type), expected in cases:
            with self.subTest(status=status, status_type=status_type):
                self.assertEqual(classify_tracking(status, status_type)["outcome"], expected)

    def test_delivered_on_the_return_leg_is_not_a_customer_delivery(self):
        self.assertNotEqual(classify_tracking("Delivered", "RT")["outcome"], "delivered")

    def test_closed_flags(self):
        self.assertTrue(classify_tracking("Delivered", "DL")["closed"])
        self.assertTrue(classify_tracking("Lost")["closed"])
        self.assertFalse(classify_tracking("In Transit", "RT")["closed"])
        self.assertFalse(classify_tracking("In Transit", "UD")["closed"])

    def test_normalizes_documented_pull_response(self):
        shipment = {
            "AWB": "72510016030",
            "ReferenceNo": "26288668",
            "OrderType": "COD",
            "Status": {
                "Status": "RTO",
                "StatusLocation": "Bengaluru_East (Karnataka)",
                "StatusDateTime": "2013-11-11T17:13:31",
            },
            "Consignee": {"Name": "sanjay", "City": "Surat", "PinCode": 395006},
            "ChargedWeight": 500,
        }
        data = normalize_tracking_shipment("72510016030", shipment)
        self.assertEqual(data["status"], "RTO")
        self.assertEqual(data["destinationPin"], "395006")
        self.assertEqual(data["chargedWeightGrams"], 500)
        self.assertEqual(data["orderType"], "COD")
        self.assertEqual(data["referenceNo"], "26288668")

    def test_normalizes_documented_push_payload(self):
        pushed = {
            "Shipment": {
                "Status": {
                    "Status": "Manifested",
                    "StatusDateTime": "2019-01-09T17:10:42.767",
                    "StatusType": "UD",
                    "StatusLocation": "Chandigarh_Raiprkln_C (Chandigarh)",
                    "Instructions": "Manifest uploaded",
                },
                "NSLCode": "X-UCI",
                "ReferenceNo": "28",
                "AWB": "XXXXXXXXXXXX",
            }
        }
        [raw] = shipment_sync.extract_push_shipments(pushed)
        data = normalize_tracking_shipment("", raw)
        self.assertEqual(data["awb"], "XXXXXXXXXXXX")
        self.assertEqual(data["statusType"], "UD")
        self.assertEqual(data["nslCode"], "X-UCI")


# ---------------------------------------------------------------- transitions


class ApplyTrackingTests(unittest.TestCase):
    def _apply(self, order, tracking, shipment=None):
        self.orders = FakeCollection([order])
        self.shipments = FakeCollection([shipment or _shipment(order)])
        self.notify = MagicMock()
        self.ledger = MagicMock()
        with patch.object(shipment_sync, "orders", self.orders), patch.object(
            shipment_sync, "shipments", self.shipments
        ), patch.object(shipment_sync, "send_order_status_update", self.notify), patch(
            "app.services.ledger_service.sync_delivery_charge_for_order", self.ledger
        ):
            summary = shipment_sync.apply_tracking_update(
                self.shipments.docs[0], tracking, background_tasks=MagicMock()
            )
        return summary, self.orders.docs[0], self.shipments.docs[0]

    def test_in_transit_moves_confirmed_and_processing_to_shipped(self):
        for start in ("confirmed", "processing"):
            with self.subTest(start=start):
                summary, order, shipment = self._apply(
                    _order(orderStatus=start), _tracking("In Transit")
                )
                self.assertEqual(order["orderStatus"], "shipped")
                self.assertEqual(summary["orderStatus"], "shipped")
                self.assertEqual(self.notify.call_args[0][2], "shipped")
                self.assertEqual(shipment["status"], "in_transit")
                self.assertIn("lastSyncedAt", shipment)

    def test_pre_pickup_changes_nothing_on_the_order(self):
        _, order, _ = self._apply(_order(), _tracking("Manifested"))
        self.assertEqual(order["orderStatus"], "confirmed")
        self.notify.assert_not_called()

    def test_never_moves_backwards(self):
        _, order, _ = self._apply(_order(orderStatus="delivered"), _tracking("In Transit"))
        self.assertEqual(order["orderStatus"], "delivered")
        self.notify.assert_not_called()

    def test_later_statuses_are_left_alone(self):
        for start in ("return_requested", "returned", "refunded"):
            with self.subTest(start=start):
                _, order, _ = self._apply(_order(orderStatus=start), _tracking("Delivered", "DL"))
                self.assertEqual(order["orderStatus"], start)
                self.notify.assert_not_called()

    def test_delivered_sets_delivered_at_and_syncs_charge(self):
        summary, order, shipment = self._apply(
            _order(orderStatus="shipped"), _tracking("Delivered", "DL")
        )
        self.assertEqual(order["orderStatus"], "delivered")
        self.assertIsInstance(order["deliveredAt"], datetime)
        self.assertEqual(order["paymentStatus"], "paid")
        self.assertNotIn("paidAt", order)  # razorpay: payment untouched
        self.assertEqual(self.notify.call_args[0][2], "delivered")
        self.ledger.assert_called_once_with(str(order["_id"]), "store-1")
        self.assertTrue(shipment["syncDone"])
        self.assertEqual(summary["orderStatus"], "delivered")

    def test_cod_becomes_paid_on_delivery(self):
        _, order, _ = self._apply(
            _order(orderStatus="shipped", paymentMethod="cod", paymentStatus="pending"),
            _tracking("Delivered", "DL"),
        )
        self.assertEqual(order["paymentStatus"], "paid")
        self.assertIsInstance(order["paidAt"], datetime)

    def test_delivered_straight_from_confirmed(self):
        _, order, _ = self._apply(_order(orderStatus="confirmed"), _tracking("Delivered", "DL"))
        self.assertEqual(order["orderStatus"], "delivered")

    def test_cancelled_orders_are_never_touched(self):
        for tracking in (
            _tracking("In Transit"),
            _tracking("Delivered", "DL"),
            _tracking("In Transit", "RT"),
            _tracking("Lost", None),
            _tracking("Manifested"),
        ):
            with self.subTest(status=tracking["status"]):
                original = _order(
                    orderStatus="cancelled", paymentMethod="cod", paymentStatus="pending"
                )
                _, order, shipment = self._apply(dict(original), tracking)
                self.assertEqual(order, original)
                self.notify.assert_not_called()
                # the shipment itself is still tracked
                self.assertEqual(shipment["trackingStatus"], tracking["status"])

    def test_rto_flags_exception_without_changing_money_or_status(self):
        summary, order, shipment = self._apply(
            _order(orderStatus="shipped", paymentMethod="cod", paymentStatus="pending"),
            _tracking("In Transit", "RT", nslCode="RT-101"),
        )
        self.assertEqual(order["orderStatus"], "shipped")
        self.assertEqual(order["paymentStatus"], "pending")
        self.assertEqual(order["courier"]["exception"]["type"], "rto")
        self.assertTrue(order["courier"]["needsAttention"])
        self.assertEqual(summary["exception"], "rto")
        self.assertEqual(shipment["status"], "rto")
        self.assertNotEqual(shipment.get("syncDone"), True)
        self.notify.assert_not_called()
        self.ledger.assert_not_called()

    def test_lost_is_flagged_and_closes_the_shipment(self):
        _, order, shipment = self._apply(_order(orderStatus="shipped"), _tracking("Lost", None))
        self.assertEqual(order["orderStatus"], "shipped")
        self.assertEqual(order["courier"]["exception"]["type"], "lost")
        self.assertTrue(shipment["syncDone"])

    def test_completed_rto_syncs_charge(self):
        self._apply(_order(orderStatus="shipped"), _tracking("RTO", "DL"))
        self.ledger.assert_called_once()

    def test_stale_push_for_closed_shipment_is_ignored(self):
        order = _order(orderStatus="delivered")
        shipment = _shipment(order, syncDone=True, status="delivered")
        self.orders = FakeCollection([order])
        self.shipments = FakeCollection([shipment])
        with patch.object(shipment_sync, "orders", self.orders), patch.object(
            shipment_sync, "shipments", self.shipments
        ), patch.object(shipment_sync, "send_order_status_update") as notify:
            summary = shipment_sync.apply_tracking_update(
                shipment, _tracking("In Transit"), background_tasks=None, source="push"
            )
        self.assertEqual(summary["outcome"], "ignored")
        self.assertEqual(self.shipments.updates, [])
        self.assertEqual(self.orders.updates, [])
        notify.assert_not_called()

    def test_notifications_run_inline_without_request_background_tasks(self):
        order = _order()
        self.orders = FakeCollection([order])
        self.shipments = FakeCollection([_shipment(order)])
        ran = []

        def fake_send(tasks, order_id, status):
            tasks.add_task(ran.append, (order_id, status))
            return True

        with patch.object(shipment_sync, "orders", self.orders), patch.object(
            shipment_sync, "shipments", self.shipments
        ), patch.object(shipment_sync, "send_order_status_update", fake_send):
            shipment_sync.apply_tracking_update(
                self.shipments.docs[0], _tracking("In Transit"), background_tasks=None
            )
        self.assertEqual(ran, [(str(order["_id"]), "shipped")])


# ---------------------------------------------------------------- lease + batch


class LeaseTests(unittest.TestCase):
    def test_second_owner_cannot_take_a_live_lease(self):
        locks = FakeCollection()
        self.assertTrue(shipment_sync.acquire_lease("job", "a", 60, collection=locks))
        self.assertFalse(shipment_sync.acquire_lease("job", "b", 60, collection=locks))

    def test_expired_lease_can_be_taken_over(self):
        past = datetime.now(timezone.utc) - timedelta(seconds=1)
        locks = FakeCollection([{"_id": "job", "owner": "a", "expiresAt": past}])
        self.assertTrue(shipment_sync.acquire_lease("job", "b", 60, collection=locks))
        self.assertEqual(locks.docs[0]["owner"], "b")

    def test_run_is_skipped_while_another_process_holds_the_lease(self):
        future = datetime.now(timezone.utc) + timedelta(minutes=5)
        locks = FakeCollection(
            [{"_id": shipment_sync.LOCK_NAME, "owner": "other", "expiresAt": future}]
        )
        service = MagicMock()
        with patch.object(shipment_sync, "shipments", FakeCollection()):
            result = shipment_sync.run_sync_once(
                service=service, owner="me", lock_collection=locks, sleep=lambda s: None
            )
        self.assertFalse(result["ran"])
        service.track_shipment.assert_not_called()

    def test_two_back_to_back_runs_only_run_once(self):
        locks = FakeCollection()
        service = MagicMock()
        with patch.object(shipment_sync, "shipments", FakeCollection()):
            first = shipment_sync.run_sync_once(
                interval_minutes=30, service=service, owner="p1", lock_collection=locks,
                sleep=lambda s: None,
            )
            second = shipment_sync.run_sync_once(
                interval_minutes=30, service=service, owner="p2", lock_collection=locks,
                sleep=lambda s: None,
            )
        self.assertTrue(first["ran"])
        self.assertFalse(second["ran"])
        # held until roughly the next run
        self.assertGreater(
            locks.docs[0]["expiresAt"], datetime.now(timezone.utc) + timedelta(minutes=25)
        )


class RunSyncOnceTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.order_a = _order()
        self.order_b = _order()
        self.order_old = _order()
        self.ship_a = _shipment(self.order_a, awb="A", lastSyncedAt=now - timedelta(hours=1))
        self.ship_b = _shipment(self.order_b, awb="B")  # never synced → first
        self.ship_done = _shipment(self.order_a, awb="DONE", syncDone=True)
        self.ship_old = _shipment(self.order_old, awb="OLD", createdAt=now - timedelta(days=90))
        self.orders = FakeCollection([self.order_a, self.order_b, self.order_old])
        self.shipments = FakeCollection([self.ship_a, self.ship_b, self.ship_done, self.ship_old])

    def _run(self, service, **kwargs):
        with patch.object(shipment_sync, "orders", self.orders), patch.object(
            shipment_sync, "shipments", self.shipments
        ), patch.object(shipment_sync, "send_order_status_update"):
            return shipment_sync.run_sync_once(
                service=service, owner="me", lock_collection=FakeCollection(),
                sleep=lambda s: None, **kwargs,
            )

    def test_processes_open_shipments_oldest_checked_first(self):
        service = MagicMock()
        service.track_shipment.side_effect = lambda tenant, awb: _tracking("In Transit", awb=awb)
        stats = self._run(service)
        awbs = [c.args[1] for c in service.track_shipment.call_args_list]
        self.assertEqual(awbs, ["B", "A"])  # no DONE, no 90-day-old shipment
        self.assertEqual(stats["shipped"], 2)
        for doc in self.shipments.docs[:2]:
            self.assertIsInstance(doc["lastSyncedAt"], datetime)

    def test_batch_size_bounds_the_run(self):
        service = MagicMock()
        service.track_shipment.return_value = _tracking("Manifested")
        stats = self._run(service, batch_size=1)
        self.assertEqual(stats["checked"], 1)

    def test_errors_are_recorded_and_rate_limit_ends_the_run(self):
        service = MagicMock()
        service.track_shipment.side_effect = DelhiveryError("slow down", code="RATE_LIMIT", status_code=429)
        stats = self._run(service)
        self.assertEqual(stats["checked"], 1)
        self.assertEqual(stats["errors"], 1)
        failed = next(d for d in self.shipments.docs if d["awb"] == "B")
        self.assertIn("RATE_LIMIT", failed["lastSyncError"])
        self.assertIsInstance(failed["lastSyncedAt"], datetime)

    def test_other_errors_skip_to_next_shipment(self):
        service = MagicMock()
        service.track_shipment.side_effect = [
            DelhiveryError("not connected", code="NOT_CONNECTED"),
            _tracking("In Transit"),
        ]
        stats = self._run(service)
        self.assertEqual(stats["checked"], 2)
        self.assertEqual(stats["errors"], 1)
        self.assertEqual(stats["shipped"], 1)

    def test_stop_event_stops_before_work(self):
        stop = threading.Event()
        stop.set()
        service = MagicMock()
        self._run(service, stop_event=stop)
        service.track_shipment.assert_not_called()

    def test_disabled_when_minutes_is_zero(self):
        self.assertIsNone(shipment_sync.start_shipment_sync_loop(0))


# ---------------------------------------------------------------- webhook


class WebhookTests(unittest.TestCase):
    def _request(self, body, headers=None, query=b""):
        raw = json.dumps(body).encode()

        async def receive():
            return {"type": "http.request", "body": raw, "more_body": False}

        scope = {
            "type": "http",
            "method": "POST",
            "path": "/shipping/delhivery/webhook",
            "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
            "query_string": query,
        }
        return Request(scope, receive)

    def _call(self, token, request):
        from fastapi import BackgroundTasks, HTTPException
        from app.routes import delhivery as route

        with patch.object(route, "DELHIVERY_WEBHOOK_TOKEN", token), patch.object(
            route.shipment_sync, "apply_push_update", return_value={"awb": "AWB1", "result": "applied"}
        ) as apply:
            try:
                result = asyncio.run(route.delhivery_status_webhook(request, BackgroundTasks()))
            except HTTPException as error:
                return error.status_code, apply
        return result, apply

    PAYLOAD = {"Shipment": {"AWB": "AWB1", "Status": {"Status": "In Transit", "StatusType": "UD"}}}

    def test_rejected_when_token_not_configured(self):
        status, apply = self._call("", self._request(self.PAYLOAD, {"Authorization": "Bearer "}))
        self.assertEqual(status, 503)
        apply.assert_not_called()

    def test_rejects_missing_or_wrong_token(self):
        for headers in ({}, {"Authorization": "Bearer nope"}, {"X-Webhook-Token": "nope"}):
            with self.subTest(headers=headers):
                status, apply = self._call("s3cret", self._request(self.PAYLOAD, headers))
                self.assertEqual(status, 401)
                apply.assert_not_called()

    def test_accepts_bearer_header_custom_header_or_query_token(self):
        for headers, query in (
            ({"Authorization": "Bearer s3cret"}, b""),
            ({"X-Webhook-Token": "s3cret"}, b""),
            ({}, b"token=s3cret"),
        ):
            with self.subTest(headers=headers, query=query):
                result, apply = self._call("s3cret", self._request(self.PAYLOAD, headers, query))
                self.assertEqual(result["processed"], 1)
                apply.assert_called_once()

    def test_push_delivered_is_confirmed_by_pull_before_applying(self):
        order = _order(orderStatus="shipped", paymentMethod="cod", paymentStatus="pending")
        shipment = _shipment(order)
        orders = FakeCollection([order])
        shipments = FakeCollection([shipment])
        service = MagicMock()
        service.track_shipment.return_value = _tracking("In Transit")  # pull disagrees
        pushed = {"AWB": "AWB1", "ReferenceNo": str(order["_id"]),
                  "Status": {"Status": "Delivered", "StatusType": "DL"}}
        with patch.object(shipment_sync, "orders", orders), patch.object(
            shipment_sync, "shipments", shipments
        ), patch.object(shipment_sync, "send_order_status_update"):
            result = shipment_sync.apply_push_update(pushed, background_tasks=None, service=service)
        service.track_shipment.assert_called_once_with("store-1", "AWB1")
        self.assertEqual(result["outcome"], "in_transit")
        self.assertEqual(orders.docs[0]["orderStatus"], "shipped")
        self.assertEqual(orders.docs[0]["paymentStatus"], "pending")

    def test_push_with_mismatched_reference_is_ignored(self):
        order = _order()
        shipments = FakeCollection([_shipment(order)])
        pushed = {"AWB": "AWB1", "ReferenceNo": "someone-else",
                  "Status": {"Status": "In Transit", "StatusType": "UD"}}
        with patch.object(shipment_sync, "shipments", shipments):
            result = shipment_sync.apply_push_update(pushed, background_tasks=None)
        self.assertEqual(result["result"], "ignored")

    def test_push_in_transit_applies_without_a_pull(self):
        order = _order()
        orders = FakeCollection([order])
        shipments = FakeCollection([_shipment(order)])
        service = MagicMock()
        pushed = {"AWB": "AWB1", "Status": {"Status": "In Transit", "StatusType": "UD"}}
        with patch.object(shipment_sync, "orders", orders), patch.object(
            shipment_sync, "shipments", shipments
        ), patch.object(shipment_sync, "send_order_status_update"):
            result = shipment_sync.apply_push_update(pushed, background_tasks=None, service=service)
        service.track_shipment.assert_not_called()
        self.assertEqual(result["orderStatus"], "shipped")
        self.assertEqual(shipments.docs[0]["lastSyncSource"], "push")


# ---------------------------------------------------------------- Delhivery client


class DelhiveryClientTests(unittest.TestCase):
    def test_cancel_uses_documented_request(self):
        service = DelhiveryService(base_url="https://example.test")
        with patch.object(service, "_request", return_value={"status": True, "remark": "Shipment has been cancelled"}) as req:
            self.assertTrue(service.cancel_shipment("store-1", "AWB1"))
        method, path = req.call_args.args
        self.assertEqual((method, path), ("POST", "/api/p/edit"))
        self.assertEqual(req.call_args.kwargs["json_body"], {"waybill": "AWB1", "cancellation": "true"})

    def test_cancel_without_status_true_is_an_error(self):
        service = DelhiveryService(base_url="https://example.test")
        for body in ({"status": False, "error": "already picked"}, {}):
            with self.subTest(body=body), patch.object(service, "_request", return_value=body):
                with self.assertRaises(DelhiveryError):
                    service.cancel_shipment("store-1", "AWB1")

    def test_charge_is_none_until_the_shipment_closes(self):
        service = DelhiveryService(base_url="https://example.test")
        order = _order(address={"postalCode": "400001"})
        with patch("app.database.mongo.shipments", FakeCollection([_shipment(order)])), patch.object(
            service, "track_shipment", return_value=_tracking("In Transit")
        ), patch.object(service, "_request") as req:
            self.assertIsNone(service.fetch_shipment_charges("store-1", "AWB1"))
        req.assert_not_called()

    def test_charge_uses_calculator_with_final_status(self):
        service = DelhiveryService(base_url="https://example.test")
        order = _order(address={"postalCode": "400001"}, paymentMethod="cod")
        shipment = _shipment(
            order,
            pickupLocation="WH1",
            shippingMode="express",
            tracking={"status": "Delivered", "statusType": "DL", "chargedWeightGrams": 750},
        )
        locations = FakeCollection(
            [{"tenantId": "store-1", "provider": "delhivery", "name": "WH1", "pincode": "110001"}]
        )
        with patch("app.database.mongo.shipments", FakeCollection([shipment])), patch(
            "app.database.mongo.orders", FakeCollection([order])
        ), patch("app.database.mongo.shipping_locations", locations), patch.object(
            service, "track_shipment"
        ) as track, patch.object(
            service, "_request", return_value=[{"total_amount": 91.5, "gross_amount": 77.54}]
        ) as req:
            self.assertEqual(service.fetch_shipment_charges("store-1", "AWB1"), 91.5)
        track.assert_not_called()  # stored snapshot already closed
        params = req.call_args.kwargs["params"]
        self.assertEqual(
            params,
            {"md": "E", "ss": "Delivered", "d_pin": "400001", "o_pin": "110001", "cgm": 750, "pt": "COD"},
        )
        self.assertEqual(req.call_args.args, ("GET", "/api/kinko/v1/invoice/charges/.json"))

    def test_charged_weight_units(self):
        self.assertEqual(delhivery_service._charged_weight_grams(500), 500)
        self.assertEqual(delhivery_service._charged_weight_grams(0.5), 500)
        self.assertIsNone(delhivery_service._charged_weight_grams(0))


if __name__ == "__main__":
    unittest.main()
