import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.services.delhivery_service import DelhiveryError
from app.services.return_service import (
    RETURN_WINDOW_DAYS,
    approve_return,
    can_customer_request_return,
    issue_refund,
    mark_return_received,
    request_return,
)


def _order(**overrides):
    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    document = {
        "_id": ObjectId(),
        "tenantId": "store-1",
        "userId": user_id,
        "orderStatus": "delivered",
        "deliveredAt": now,
        "paymentMethod": "razorpay",
        "razorpayPaymentId": "pay_test",
        "items": [
            {
                "productId": ObjectId(),
                "variantId": "v1",
                "name": "Shirt",
                "quantity": 1,
            }
        ],
        "address": {
            "fullName": "Naveen",
            "phone": "9876543210",
            "addressLine1": "12 MG Road",
            "city": "Bengaluru",
            "state": "KA",
            "postalCode": "560001",
            "country": "India",
        },
        "createdAt": now,
        "updatedAt": now,
    }
    document.update(overrides)
    return document


class FakeOrders:
    def __init__(self, order):
        self.order = order

    def find_one(self, query):
        return dict(self.order)

    def update_one(self, query, update):
        self.order.update(update.get("$set") or {})


class ReturnWindowTests(unittest.TestCase):
    def test_allows_delivered_order_within_two_days(self):
        order = _order()
        self.assertTrue(can_customer_request_return(order))

    def test_blocks_after_window(self):
        order = _order(
            deliveredAt=datetime.now(timezone.utc) - timedelta(days=RETURN_WINDOW_DAYS + 1)
        )
        self.assertFalse(can_customer_request_return(order))

    def test_blocks_menu_orders(self):
        self.assertFalse(can_customer_request_return(_order(channel="menu")))

    def test_blocks_when_already_requested(self):
        self.assertFalse(
            can_customer_request_return(_order(returnRequest={"status": "requested"}))
        )


class ReturnFlowTests(unittest.TestCase):
    def test_request_return_sets_status(self):
        order = _order()
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            updated = request_return(
                order_id=str(order["_id"]),
                tenant_id="store-1",
                user_id=str(order["userId"]),
                reason="Wrong size",
            )
        self.assertEqual(updated["orderStatus"], "return_requested")
        self.assertEqual(updated["returnRequest"]["status"], "requested")

    def test_request_return_rejects_late_order(self):
        order = _order(
            deliveredAt=datetime.now(timezone.utc) - timedelta(days=5)
        )
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            with self.assertRaises(HTTPException) as error:
                request_return(
                    order_id=str(order["_id"]),
                    tenant_id="store-1",
                    user_id=str(order["userId"]),
                    reason="Wrong size",
                )
        self.assertEqual(error.exception.status_code, 400)

    def test_approve_creates_reverse_awb(self):
        order = _order(
            orderStatus="return_requested",
            returnRequest={"status": "requested", "reason": "Wrong size"},
        )
        fake = FakeOrders(order)
        reverse = MagicMock()
        reverse.create_reverse_shipment.return_value = {
            "waybill": "RWB1",
            "trackingUrl": "https://www.delhivery.com/track-v2/package/RWB1",
        }
        ctx = {
            "pickupLocationName": "HQ",
            "originPin": "560001",
            "location": {
                "name": "HQ",
                "address": "Warehouse",
                "city": "Bengaluru",
                "state": "KA",
                "pincode": "560001",
                "phone": "9999999999",
            },
        }
        with (
            patch("app.services.return_service.orders", fake),
            patch(
                "app.services.return_service.get_active_delhivery_context",
                return_value=ctx,
            ),
            patch("app.services.return_service.DelhiveryService", return_value=reverse),
        ):
            updated = approve_return(order_id=str(order["_id"]), tenant_id="store-1")
        self.assertEqual(updated["orderStatus"], "return_approved")
        self.assertEqual(updated["returnRequest"]["reverseAwb"], "RWB1")

    def test_approve_continues_when_delhivery_fails(self):
        order = _order(
            orderStatus="return_requested",
            returnRequest={"status": "requested", "reason": "Damaged"},
        )
        fake = FakeOrders(order)
        reverse = MagicMock()
        reverse.create_reverse_shipment.side_effect = DelhiveryError("pin invalid")
        ctx = {
            "pickupLocationName": "HQ",
            "originPin": "560001",
            "location": {
                "name": "HQ",
                "address": "Warehouse",
                "city": "Bengaluru",
                "state": "KA",
                "pincode": "560001",
                "phone": "9999999999",
            },
        }
        with (
            patch("app.services.return_service.orders", fake),
            patch(
                "app.services.return_service.get_active_delhivery_context",
                return_value=ctx,
            ),
            patch("app.services.return_service.DelhiveryService", return_value=reverse),
        ):
            updated = approve_return(order_id=str(order["_id"]), tenant_id="store-1")
        self.assertEqual(updated["orderStatus"], "return_approved")
        self.assertIn("pin invalid", updated["returnRequest"]["reverseNote"])

    def test_received_restores_stock(self):
        order = _order(
            orderStatus="return_approved",
            returnRequest={"status": "approved", "stockRestored": False},
        )
        fake = FakeOrders(order)
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.restore_variant_stock") as restore,
        ):
            updated = mark_return_received(
                order_id=str(order["_id"]),
                tenant_id="store-1",
            )
        restore.assert_called_once()
        self.assertEqual(updated["orderStatus"], "returned")
        self.assertTrue(updated["returnRequest"]["stockRestored"])

    def test_cod_refund_is_manual(self):
        order = _order(
            orderStatus="returned",
            paymentMethod="cod",
            razorpayPaymentId="",
            returnRequest={"status": "received"},
        )
        fake = FakeOrders(order)
        with patch("app.services.return_service.orders", fake):
            updated = issue_refund(order_id=str(order["_id"]), tenant_id="store-1")
        self.assertEqual(updated["orderStatus"], "refunded")
        self.assertEqual(updated["returnRequest"]["refundStatus"], "manual")

    def test_online_refund_calls_razorpay(self):
        order = _order(
            orderStatus="returned",
            returnRequest={"status": "received"},
        )
        fake = FakeOrders(order)
        refund = MagicMock(return_value={"id": "rfnd_1", "status": "processed"})
        with (
            patch("app.services.return_service.orders", fake),
            patch("app.services.return_service.razorpay_client") as client,
        ):
            client.payment.refund = refund
            updated = issue_refund(order_id=str(order["_id"]), tenant_id="store-1")
        refund.assert_called_once_with("pay_test")
        self.assertEqual(updated["returnRequest"]["refundId"], "rfnd_1")
        self.assertEqual(updated["paymentStatus"], "refunded")


if __name__ == "__main__":
    unittest.main()
