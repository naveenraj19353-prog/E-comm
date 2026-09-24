import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.orders import RequestReturn
from app.routes import orders as orders_route
from app.services import ledger_service
from app.services.return_service import (
    calculate_refund_amount,
    covers_whole_order,
    issue_refund,
    mark_return_received,
    request_return,
    resolve_return_items,
    serialize_return,
    stored_return_items,
)

SHIRT = ObjectId()
JEANS = ObjectId()
CAP = ObjectId()


def _order(**overrides):
    now = datetime.now(timezone.utc)
    document = {
        "_id": ObjectId(),
        "tenantId": "store-1",
        "userId": ObjectId(),
        "orderStatus": "delivered",
        "deliveredAt": now,
        "paymentMethod": "razorpay",
        "paymentStatus": "paid",
        "razorpayPaymentId": "pay_test",
        "items": [
            {"productId": SHIRT, "variantId": "s-m", "name": "Shirt", "price": 500, "quantity": 2, "subtotal": 1000},
            {"productId": JEANS, "variantId": "j-32", "name": "Jeans", "price": 800, "quantity": 1, "subtotal": 800},
            {"productId": CAP, "variantId": "c-1", "name": "Cap", "price": 200, "quantity": 1, "subtotal": 200},
        ],
        "subtotal": 2000,
        "discount": 200,
        "shipping": 50,
        "totalAmount": 1850,
        "createdAt": now,
        "updatedAt": now,
    }
    document.update(overrides)
    return document


def _select(product_id, variant_id, quantity):
    return {"productId": str(product_id), "variantId": variant_id, "quantity": quantity}


class FakeOrders:
    def __init__(self, order):
        self.order = order
        self.claims = 0

    def find_one(self, query, projection=None):
        return dict(self.order)

    def update_one(self, query, update):
        self.order.update(update.get("$set") or {})
        for key in update.get("$unset") or {}:
            if key.startswith("returnRequest."):
                self.order.get("returnRequest", {}).pop(key.split(".", 1)[1], None)

    def find_one_and_update(self, query, update):
        current = self.order.get("returnRequest") or {}
        if current.get("status") != "received" or current.get("refundInProgress"):
            return None
        self.claims += 1
        before = dict(self.order)
        for key, value in (update.get("$set") or {}).items():
            self.order.setdefault("returnRequest", {})[key.split(".", 1)[1]] = value
        return before


class RefundCalculationTests(unittest.TestCase):
    def test_whole_order_refunds_total_including_shipping(self):
        order = _order()
        items = resolve_return_items(order, None)
        self.assertTrue(covers_whole_order(order, items))
        self.assertEqual(calculate_refund_amount(order, items), 1850.0)

    def test_partial_return_takes_proportional_discount_and_no_shipping(self):
        order = _order()
        items = resolve_return_items(order, [_select(JEANS, "j-32", 1)])
        # 800 - 200 * 800 / 2000 = 720; shipping (50) stays with the store.
        self.assertEqual(calculate_refund_amount(order, items), 720.0)

    def test_partial_quantity_of_a_line(self):
        order = _order()
        items = resolve_return_items(order, [_select(SHIRT, "s-m", 1)])
        # one of two shirts: 500 - 200 * 500 / 2000 = 450
        self.assertEqual(calculate_refund_amount(order, items), 450.0)

    def test_no_discount(self):
        order = _order(discount=0, totalAmount=2050)
        items = resolve_return_items(order, [_select(CAP, "c-1", 1)])
        self.assertEqual(calculate_refund_amount(order, items), 200.0)

    def test_rounds_to_two_decimals(self):
        order = _order(
            items=[
                {"productId": SHIRT, "variantId": "a", "name": "A", "price": 33.33, "quantity": 1, "subtotal": 33.33},
                {"productId": JEANS, "variantId": "b", "name": "B", "price": 33.33, "quantity": 1, "subtotal": 33.33},
                {"productId": CAP, "variantId": "c", "name": "C", "price": 33.34, "quantity": 1, "subtotal": 33.34},
            ],
            subtotal=100,
            discount=10,
            shipping=0,
            totalAmount=90,
        )
        items = resolve_return_items(order, [_select(SHIRT, "a", 1)])
        # 33.33 - 10 * 33.33 / 100 = 29.997 -> 30.00
        self.assertEqual(calculate_refund_amount(order, items), 30.0)

    def test_capped_at_amount_still_refundable(self):
        order = _order()
        items = resolve_return_items(order, [_select(JEANS, "j-32", 1)])
        self.assertEqual(calculate_refund_amount(order, items, already_refunded=1500), 350.0)
        self.assertEqual(calculate_refund_amount(order, items, already_refunded=1850), 0.0)

    def test_discount_larger_than_subtotal_never_goes_negative(self):
        order = _order(discount=5000, totalAmount=50)
        items = resolve_return_items(order, [_select(JEANS, "j-32", 1)])
        self.assertEqual(calculate_refund_amount(order, items), 0.0)

    def test_all_lines_selected_is_a_whole_order_return(self):
        order = _order()
        items = resolve_return_items(
            order,
            [_select(SHIRT, "s-m", 2), _select(JEANS, "j-32", 1), _select(CAP, "c-1", 1)],
        )
        self.assertTrue(covers_whole_order(order, items))
        self.assertEqual(calculate_refund_amount(order, items), 1850.0)


class ItemValidationTests(unittest.TestCase):
    def test_omitted_items_means_whole_order(self):
        items = resolve_return_items(_order(), None)
        self.assertEqual([item["quantity"] for item in items], [2, 1, 1])

    def test_rejects_item_not_in_order(self):
        with self.assertRaises(HTTPException) as error:
            resolve_return_items(_order(), [_select(ObjectId(), "x", 1)])
        self.assertEqual(error.exception.status_code, 400)

    def test_rejects_wrong_variant(self):
        with self.assertRaises(HTTPException):
            resolve_return_items(_order(), [_select(SHIRT, "s-xl", 1)])

    def test_rejects_more_than_ordered(self):
        with self.assertRaises(HTTPException) as error:
            resolve_return_items(_order(), [_select(SHIRT, "s-m", 3)])
        self.assertIn("at most 2", error.exception.detail)

    def test_rejects_duplicates_that_add_up_to_more_than_ordered(self):
        with self.assertRaises(HTTPException):
            resolve_return_items(
                _order(), [_select(SHIRT, "s-m", 2), _select(SHIRT, "s-m", 1)]
            )

    def test_rejects_zero_quantity_and_empty_selection(self):
        with self.assertRaises(HTTPException):
            resolve_return_items(_order(), [_select(SHIRT, "s-m", 0)])
        with self.assertRaises(HTTPException):
            resolve_return_items(_order(), [])

    def test_spreads_quantity_over_duplicate_lines(self):
        order = _order(
            items=[
                {"productId": SHIRT, "variantId": "s-m", "name": "Shirt", "price": 500, "quantity": 1, "subtotal": 500},
                {"productId": SHIRT, "variantId": "s-m", "name": "Shirt", "price": 500, "quantity": 1, "subtotal": 500},
            ],
            subtotal=1000,
            discount=0,
            totalAmount=1000,
        )
        items = resolve_return_items(order, [_select(SHIRT, "s-m", 2)])
        self.assertEqual([item["lineIndex"] for item in items], [0, 1])
        self.assertTrue(covers_whole_order(order, items))

    def test_request_model_accepts_items_or_none(self):
        self.assertIsNone(RequestReturn(reason="Wrong size").items)
        payload = RequestReturn(
            reason="Wrong size",
            items=[{"productId": str(SHIRT), "variantId": "s-m", "quantity": 1}],
        )
        self.assertEqual(payload.items[0].quantity, 1)
        with self.assertRaises(ValidationError):
            RequestReturn(
                reason="Wrong size",
                items=[{"productId": str(SHIRT), "variantId": "s-m", "quantity": 0}],
            )


class PartialReturnFlowTests(unittest.TestCase):
    def test_request_stores_items_and_refund_amount(self):
        order = _order()
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            updated = request_return(
                order_id=str(order["_id"]),
                tenant_id="store-1",
                user_id=str(order["userId"]),
                reason="Jeans do not fit",
                items=[_select(JEANS, "j-32", 1)],
            )
        stored = updated["returnRequest"]
        self.assertEqual(updated["orderStatus"], "return_requested")
        self.assertTrue(stored["partial"])
        self.assertEqual(stored["refundAmount"], 720.0)
        self.assertEqual(
            [(item["productId"], item["quantity"]) for item in stored["items"]],
            [(str(JEANS), 1)],
        )

    def test_request_without_items_is_whole_order(self):
        order = _order()
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            updated = request_return(
                order_id=str(order["_id"]),
                tenant_id="store-1",
                user_id=str(order["userId"]),
                reason="Changed my mind",
            )
        self.assertFalse(updated["returnRequest"]["partial"])
        self.assertEqual(updated["returnRequest"]["refundAmount"], 1850.0)

    def test_second_request_is_blocked(self):
        order = _order(returnRequest={"status": "requested"})
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            with self.assertRaises(HTTPException):
                request_return(
                    order_id=str(order["_id"]),
                    tenant_id="store-1",
                    user_id=str(order["userId"]),
                    reason="Again",
                    items=[_select(CAP, "c-1", 1)],
                )

    def test_received_restocks_only_returned_quantities(self):
        order = _order()
        order["returnRequest"] = {
            "status": "approved",
            "items": resolve_return_items(order, [_select(SHIRT, "s-m", 1)]),
            "stockRestored": False,
        }
        fake = FakeOrders(order)
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.restore_variant_stock") as restore,
        ):
            updated = mark_return_received(order_id=str(order["_id"]), tenant_id="store-1")
        restore.assert_called_once()
        product_id, variant_id, quantity, _now = restore.call_args.args
        self.assertEqual((product_id, variant_id, quantity), (SHIRT, "s-m", 1))
        self.assertEqual(updated["orderStatus"], "partially_returned")

    def test_received_is_idempotent_for_stock(self):
        order = _order()
        order["returnRequest"] = {
            "status": "received",
            "items": resolve_return_items(order, [_select(SHIRT, "s-m", 1)]),
            "stockRestored": True,
        }
        fake = FakeOrders(order)
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.restore_variant_stock") as restore,
        ):
            mark_return_received(order_id=str(order["_id"]), tenant_id="store-1")
        restore.assert_not_called()

    def test_legacy_return_without_items_restocks_everything(self):
        order = _order(returnRequest={"status": "approved", "stockRestored": False})
        fake = FakeOrders(order)
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.restore_variant_stock") as restore,
        ):
            updated = mark_return_received(order_id=str(order["_id"]), tenant_id="store-1")
        self.assertEqual(
            [call.args[2] for call in restore.call_args_list], [2, 1, 1]
        )
        self.assertEqual(updated["orderStatus"], "returned")

    def _received(self, selection=None, **overrides):
        order = _order(**{"orderStatus": "partially_returned", **overrides})
        order["returnRequest"] = {"status": "received", "stockRestored": True}
        if selection is not None:
            order["returnRequest"]["items"] = resolve_return_items(order, selection)
        return order

    def _refund(self, order, ledger_entry=None, refund_side_effect=None):
        fake = FakeOrders(order)
        refund = MagicMock(
            return_value={"id": "rfnd_1", "status": "processed"},
            side_effect=refund_side_effect,
        )
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.razorpay_client") as client,
            patch("app.services.return_service.ledger_entries") as ledger,
            patch("app.services.return_service.record_order_refund") as full,
            patch("app.services.return_service.record_partial_refund") as partial,
        ):
            ledger.find_one.return_value = ledger_entry
            client.payment.refund = refund
            try:
                updated = issue_refund(order_id=str(order["_id"]), tenant_id="store-1")
            except HTTPException as error:
                return fake, refund, full, partial, error
        return fake, refund, full, partial, updated

    def test_partial_razorpay_refund(self):
        order = self._received([_select(JEANS, "j-32", 1)])
        _fake, refund, full, partial, updated = self._refund(order)
        refund.assert_called_once_with("pay_test", {"amount": 72000})
        partial.assert_called_once_with(order["_id"], 720.0)
        full.assert_not_called()
        self.assertEqual(updated["paymentStatus"], "partially_refunded")
        self.assertEqual(updated["orderStatus"], "partially_refunded")
        self.assertEqual(updated["refundedAmount"], 720.0)
        self.assertEqual(updated["returnRequest"]["refundAmount"], 720.0)
        self.assertEqual(updated["returnRequest"]["refundId"], "rfnd_1")
        self.assertNotIn("refundInProgress", updated["returnRequest"])

    def test_partial_capped_by_earlier_refund_becomes_full(self):
        order = self._received([_select(JEANS, "j-32", 1)])
        _fake, refund, full, partial, updated = self._refund(
            order, ledger_entry={"refundedAmount": 1500}
        )
        refund.assert_called_once_with("pay_test")
        full.assert_called_once_with(order["_id"])
        partial.assert_not_called()
        self.assertEqual(updated["returnRequest"]["refundAmount"], 350.0)
        self.assertEqual(updated["paymentStatus"], "refunded")
        self.assertEqual(updated["refundedAmount"], 1850.0)

    def test_nothing_left_to_refund_on_partial(self):
        order = self._received([_select(JEANS, "j-32", 1)])
        _fake, refund, *_rest, error = self._refund(
            order, ledger_entry={"refundedAmount": 1850}
        )
        self.assertEqual(error.status_code, 400)
        refund.assert_not_called()

    def test_whole_order_refund_uses_full_razorpay_refund(self):
        order = self._received(None, orderStatus="returned")
        _fake, refund, full, partial, updated = self._refund(order)
        refund.assert_called_once_with("pay_test")
        full.assert_called_once_with(order["_id"])
        partial.assert_not_called()
        self.assertEqual(updated["orderStatus"], "refunded")
        self.assertEqual(updated["paymentStatus"], "refunded")

    def test_refund_already_in_progress_is_rejected(self):
        order = self._received([_select(JEANS, "j-32", 1)])
        order["returnRequest"]["refundInProgress"] = True
        _fake, refund, *_rest, error = self._refund(order)
        self.assertEqual(error.status_code, 409)
        refund.assert_not_called()

    def test_razorpay_failure_releases_claim(self):
        order = self._received([_select(JEANS, "j-32", 1)])
        fake, _refund, _full, partial, error = self._refund(
            order, refund_side_effect=RuntimeError("gateway down")
        )
        self.assertEqual(error.status_code, 400)
        partial.assert_not_called()
        self.assertNotIn("refundInProgress", fake.order["returnRequest"])
        self.assertEqual(fake.order["returnRequest"]["status"], "received")

    def test_cod_partial_refund_stays_manual(self):
        order = self._received(
            [_select(CAP, "c-1", 1)],
            paymentMethod="cod",
            razorpayPaymentId="",
        )
        _fake, refund, full, partial, updated = self._refund(order)
        refund.assert_not_called()
        full.assert_not_called()
        partial.assert_not_called()
        self.assertEqual(updated["returnRequest"]["refundStatus"], "manual")
        self.assertEqual(updated["returnRequest"]["refundAmount"], 180.0)
        self.assertEqual(updated["orderStatus"], "partially_refunded")
        self.assertEqual(updated["paymentStatus"], "paid")


class SerializeReturnTests(unittest.TestCase):
    def test_legacy_record_serializes_as_whole_order(self):
        order = _order(returnRequest={"status": "requested", "reason": "Old"})
        data = serialize_return(order)
        self.assertFalse(data["partial"])
        self.assertEqual(len(data["items"]), 3)
        self.assertEqual(data["refundAmount"], 1850.0)

    def test_partial_record_serializes_selected_items(self):
        order = _order()
        order["returnRequest"] = {
            "status": "requested",
            "items": resolve_return_items(order, [_select(SHIRT, "s-m", 1)]),
            "refundAmount": 450.0,
        }
        data = serialize_return(order)
        self.assertTrue(data["partial"])
        self.assertEqual(data["refundAmount"], 450.0)
        self.assertEqual(data["items"][0]["quantity"], 1)
        self.assertNotIn("lineIndex", data["items"][0])

    def test_stored_items_survive_line_index_drift(self):
        order = _order()
        order["returnRequest"] = {
            "status": "requested",
            "items": [{"lineIndex": 7, "productId": str(CAP), "variantId": "c-1", "quantity": 1}],
        }
        items = stored_return_items(order)
        self.assertEqual(items[0]["lineIndex"], 2)


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key, direction):
        self.docs.sort(key=lambda doc: doc.get(key), reverse=direction == -1)
        return self

    def skip(self, count):
        self.docs = self.docs[count:]
        return self

    def limit(self, count):
        self.docs = self.docs[:count]
        return self

    def __iter__(self):
        return iter(self.docs)


class FakeListOrders:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def _match(self, doc, query):
        for key, expected in query.items():
            if isinstance(expected, dict) and "$in" in expected:
                if doc.get(key) not in expected["$in"]:
                    return False
            elif doc.get(key) != expected:
                return False
        return True

    def count_documents(self, query):
        return len([doc for doc in self.docs if self._match(doc, query)])

    def find(self, query):
        self.queries.append(query)
        return FakeCursor([dict(doc) for doc in self.docs if self._match(doc, query)])

    def aggregate(self, pipeline):
        match = pipeline[0]["$match"]
        counts = {}
        for doc in self.docs:
            if self._match(doc, match):
                counts[doc.get("orderStatus")] = counts.get(doc.get("orderStatus"), 0) + 1
        return [{"_id": key, "count": value} for key, value in counts.items()]


class AdminOrderListPaginationTests(unittest.TestCase):
    def setUp(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.customer_ids = [ObjectId(), ObjectId()]
        self.docs = [
            {
                "_id": ObjectId(),
                "tenantId": "store-1",
                "userId": self.customer_ids[index % 2],
                "orderNumber": index + 1,
                "orderStatus": "delivered" if index % 3 == 0 else "confirmed",
                "items": [],
                "createdAt": start + timedelta(minutes=index),
            }
            for index in range(30)
        ]
        self.docs.append({**self.docs[0], "_id": ObjectId(), "tenantId": "store-2"})
        self.users = MagicMock()
        self.users.find.return_value = [
            {"_id": self.customer_ids[0], "name": "Asha", "email": "asha@example.com"},
        ]
        self.shipments = MagicMock()
        self.shipments.find.return_value = []

    def _list(self, **params):
        with (
            patch.object(orders_route, "orders", FakeListOrders(self.docs)),
            patch.object(orders_route, "users", self.users),
            patch.object(orders_route, "shipments", self.shipments),
        ):
            return orders_route.list_tenant_orders(
                current_user={"role": "admin", "tenantId": "store-1"},
                tenant_id=None,
                page=params.get("page", 1),
                page_size=params.get("page_size", 25),
                status=params.get("status"),
            )

    def test_first_page_defaults(self):
        result = self._list()
        self.assertTrue(result["success"])
        self.assertEqual(result["total"], 30)
        self.assertEqual(result["page"], 1)
        self.assertEqual(result["pageSize"], 25)
        self.assertEqual(result["count"], 25)
        self.assertEqual(result["data"][0]["orderRef"], "RC-10030")
        self.assertEqual(result["statusCounts"]["all"], 30)

    def test_second_page(self):
        result = self._list(page=2)
        self.assertEqual(result["count"], 5)
        self.assertEqual(result["data"][-1]["orderRef"], "RC-10001")

    def test_page_size_is_capped(self):
        result = self._list(page_size=500)
        self.assertEqual(result["pageSize"], 100)
        self.assertEqual(result["count"], 30)

    def test_users_are_batched(self):
        result = self._list()
        self.users.find.assert_called_once()
        self.users.find_one.assert_not_called()
        self.shipments.find.assert_called_once()
        self.shipments.find_one.assert_not_called()
        names = {order["customer"]["name"] for order in result["data"]}
        self.assertEqual(names, {"Asha", "Customer"})

    def test_status_filter(self):
        result = self._list(status="delivered")
        self.assertEqual(result["total"], 10)
        self.assertTrue(all(order["orderStatus"] == "delivered" for order in result["data"]))
        self.assertEqual(result["statusCounts"]["confirmed"], 20)


class PayoutRecorderNameTests(unittest.TestCase):
    def test_recorded_by_name_is_batch_resolved(self):
        admin_id = ObjectId()
        docs = [
            {"_id": ObjectId(), "tenantId": "store-1", "recordedBy": str(admin_id), "createdAt": 2},
            {"_id": ObjectId(), "tenantId": "store-1", "recordedBy": "not-an-id", "createdAt": 1},
            {"_id": ObjectId(), "tenantId": "store-1", "recordedBy": None, "createdAt": 0},
        ]
        payouts = MagicMock()
        payouts.count_documents.return_value = 3
        payouts.find.return_value = FakeCursor(list(docs))
        users = MagicMock()
        users.find.return_value = [{"_id": admin_id, "name": "Platform Owner"}]
        with (
            patch.object(ledger_service, "payouts", payouts),
            patch.object(ledger_service, "users", users),
        ):
            result = ledger_service.get_payouts("store-1")
        users.find.assert_called_once()
        names = [payout["recordedByName"] for payout in result["payouts"]]
        self.assertEqual(names, ["Platform Owner", None, None])


if __name__ == "__main__":
    unittest.main()
