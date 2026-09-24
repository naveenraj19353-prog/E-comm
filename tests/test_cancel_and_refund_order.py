import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.services import order_fulfillment


class FakeOrders:
    def __init__(self):
        self.updates = []

    def update_one(self, query, update):
        self.updates.append((query, update))


class CancelAndRefundOrderTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.fake_orders = FakeOrders()

    def test_refunds_paid_razorpay_order_and_reverses_ledger(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "razorpay",
            "paymentStatus": "paid",
            "razorpayPaymentId": "pay_123",
        }
        fake_client = MagicMock()
        with patch.object(order_fulfillment, "orders", self.fake_orders), patch.object(
            order_fulfillment, "client", fake_client
        ), patch.object(order_fulfillment, "record_order_refund") as mock_reverse:
            order_fulfillment.cancel_and_refund_order(order, self.now)

        fake_client.payment.refund.assert_called_once_with("pay_123")
        mock_reverse.assert_called_once_with(order["_id"])
        update = self.fake_orders.updates[0][1]["$set"]
        self.assertEqual(update["paymentStatus"], "refunded")

    def test_cod_order_is_not_refunded(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "cod",
            "paymentStatus": "pending",
        }
        fake_client = MagicMock()
        with patch.object(order_fulfillment, "orders", self.fake_orders), patch.object(
            order_fulfillment, "client", fake_client
        ):
            order_fulfillment.cancel_and_refund_order(order, self.now)
        fake_client.payment.refund.assert_not_called()
        self.assertEqual(self.fake_orders.updates, [])

    def test_refund_failure_is_recorded_not_raised(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "razorpay",
            "paymentStatus": "paid",
            "razorpayPaymentId": "pay_123",
        }
        fake_client = MagicMock()
        fake_client.payment.refund.side_effect = Exception("razorpay down")
        with patch.object(order_fulfillment, "orders", self.fake_orders), patch.object(
            order_fulfillment, "client", fake_client
        ):
            order_fulfillment.cancel_and_refund_order(order, self.now)  # must not raise
        update = self.fake_orders.updates[0][1]["$set"]
        self.assertEqual(update["refundStatus"], "failed")

    def test_cancels_delhivery_shipment_when_waybill_present(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "cod",
            "paymentStatus": "pending",
            "courier": {"waybill": "AWB999"},
        }
        with patch.object(order_fulfillment, "orders", self.fake_orders), patch(
            "app.services.delhivery_service.DelhiveryService.cancel_shipment",
            return_value=True,
        ) as mock_cancel:
            order_fulfillment.cancel_and_refund_order(order, self.now)
        mock_cancel.assert_called_once_with("store-1", "AWB999")
        update = self.fake_orders.updates[0][1]["$set"]
        self.assertIn("courier.cancelledAt", update)

    def test_shipment_cancel_failure_is_recorded_not_raised(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "cod",
            "paymentStatus": "pending",
            "courier": {"waybill": "AWB999"},
        }
        with patch.object(order_fulfillment, "orders", self.fake_orders), patch(
            "app.services.delhivery_service.DelhiveryService.cancel_shipment",
            side_effect=Exception("already picked up"),
        ):
            order_fulfillment.cancel_and_refund_order(order, self.now)  # must not raise
        update = self.fake_orders.updates[0][1]["$set"]
        self.assertTrue(update["courier.cancelFailed"])

    def test_no_payment_and_no_shipment_is_a_no_op(self):
        order = {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "paymentMethod": "cod",
            "paymentStatus": "pending",
        }
        with patch.object(order_fulfillment, "orders", self.fake_orders):
            order_fulfillment.cancel_and_refund_order(order, self.now)
        self.assertEqual(self.fake_orders.updates, [])


if __name__ == "__main__":
    unittest.main()
