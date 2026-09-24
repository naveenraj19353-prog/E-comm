import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.services import order_fulfillment


class FakeIntents:
    def __init__(self, doc):
        self.doc = doc

    def update_one(self, query, update):
        assert query["_id"] == self.doc["_id"]
        self.doc.update(update["$set"])


class RefundFailureIsNeverSilentTests(unittest.TestCase):
    """A stock-out / bad-address auto-refund used to swallow a failed
    Razorpay call: the customer was told "payment was refunded" and the
    intent was marked refunded, when in fact nothing was returned to them.
    """

    def _intent(self):
        return {"_id": ObjectId(), "tenantId": "shop-a", "status": "processing"}

    def test_successful_refund_marks_the_intent_refunded(self):
        intents = FakeIntents(self._intent())
        client = MagicMock()
        with patch.object(order_fulfillment, "client", client), patch.object(
            order_fulfillment, "payment_intents", intents
        ), patch("app.services.order_fulfillment.alert") as mock_alert:
            refunded = order_fulfillment._refund_claimed_payment(intents.doc, "pay_1")
        self.assertTrue(refunded)
        self.assertEqual(intents.doc["status"], "refunded")
        mock_alert.assert_not_called()

    def test_failed_refund_does_not_claim_success_and_alerts(self):
        intents = FakeIntents(self._intent())
        client = MagicMock()
        client.payment.refund.side_effect = Exception("razorpay down")
        with patch.object(order_fulfillment, "client", client), patch.object(
            order_fulfillment, "payment_intents", intents
        ), patch("app.services.order_fulfillment.alert") as mock_alert:
            refunded = order_fulfillment._refund_claimed_payment(intents.doc, "pay_1")
        self.assertFalse(refunded)
        # Never marked "refunded" when Razorpay rejected the call.
        self.assertEqual(intents.doc["status"], "refund_failed")
        mock_alert.assert_called_once()
        self.assertEqual(mock_alert.call_args.args[0], "razorpay.refund_failed")

    def test_out_of_stock_message_reflects_a_failed_refund(self):
        intent = self._intent()
        client = MagicMock()
        client.payment.refund.side_effect = Exception("razorpay down")
        with patch.object(order_fulfillment, "client", client), patch.object(
            order_fulfillment, "payment_intents", FakeIntents(intent)
        ), patch.object(order_fulfillment, "_reserve_stock", return_value=False), patch(
            "app.services.order_fulfillment.alert"
        ):
            with self.assertRaises(HTTPException) as context:
                order_fulfillment._reserve_paid_order_stock(
                    intent, [], "pay_1", datetime.now(timezone.utc)
                )
        self.assertIn("alerted", context.exception.detail)
        self.assertNotIn("has been refunded", context.exception.detail)

    def test_out_of_stock_message_confirms_a_successful_refund(self):
        intent = self._intent()
        client = MagicMock()
        with patch.object(order_fulfillment, "client", client), patch.object(
            order_fulfillment, "payment_intents", FakeIntents(intent)
        ), patch.object(order_fulfillment, "_reserve_stock", return_value=False):
            with self.assertRaises(HTTPException) as context:
                order_fulfillment._reserve_paid_order_stock(
                    intent, [], "pay_1", datetime.now(timezone.utc)
                )
        self.assertIn("has been refunded", context.exception.detail)

    def test_a_failed_refund_is_flagged_rather_than_re_offered(self):
        """A `refund_failed` intent must not look like a normal pending order
        to the customer — they'd otherwise see a generic error and could try
        to pay again for something support already needs to sort out."""
        with self.assertRaises(HTTPException) as context:
            order_fulfillment._validate_payment_intent(
                {"tenantId": "shop-a", "userId": "u1", "status": "refund_failed"},
                "shop-a",
                "u1",
            )
        self.assertEqual(context.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
