import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId

from app.routes import orders as orders_route


class FakeOrders:
    def __init__(self, order):
        self.order = order
        self.updates = []

    def find_one(self, query):
        return dict(self.order)

    def update_one(self, query, update):
        self.updates.append(update)
        self.order.update(update.get("$set", {}))


class FakeShipments:
    """No shipment on file for any of these orders (none carries a waybill)."""

    def find_one(self, query):
        return None


class CodPaidOnDeliveryTests(unittest.TestCase):
    def _order(self, **overrides):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "orderStatus": "shipped",
            "paymentMethod": "cod",
            "paymentStatus": "pending",
            "items": [],
            "subtotal": 100,
            "discount": 0,
            "shipping": 0,
            "totalAmount": 100,
        }
        order.update(overrides)
        return order

    def _current_user(self):
        return {"role": "admin", "tenantId": "store-1", "userId": "admin-1"}

    def _run(self, order):
        fake_orders = FakeOrders(order)
        with patch.object(orders_route, "orders", fake_orders), patch.object(
            orders_route, "shipments", FakeShipments()
        ), patch.object(
            orders_route, "send_order_status_update"
        ), patch.object(orders_route, "cancel_and_refund_order"):
            orders_route.update_order_status(
                str(order["_id"]),
                orders_route.UpdateOrderStatus(orderStatus="delivered"),
                background_tasks=None,
                current_user=self._current_user(),
            )
        return fake_orders.order

    def test_cod_order_flips_to_paid_on_delivery(self):
        updated = self._run(self._order())
        self.assertEqual(updated["paymentStatus"], "paid")
        self.assertIn("paidAt", updated)

    def test_already_paid_cod_order_is_left_alone(self):
        updated = self._run(self._order(paymentStatus="paid"))
        self.assertNotIn("paidAt", updated)  # not re-stamped

    def test_razorpay_order_payment_status_is_untouched(self):
        updated = self._run(
            self._order(paymentMethod="razorpay", paymentStatus="paid")
        )
        self.assertEqual(updated["paymentStatus"], "paid")
        self.assertNotIn("paidAt", updated)


if __name__ == "__main__":
    unittest.main()
