import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.config import TENANT_BASE_DOMAIN
from app.services.whatsapp_notification_service import (
    _message_for,
    process_notification,
    share_product_with_customer,
)


class WhatsAppNotificationTests(unittest.TestCase):
    def setUp(self):
        self.notification_id = ObjectId()
        self.order_id = ObjectId()
        self.user_id = ObjectId()
        self.notification = {
            "_id": self.notification_id,
            "orderId": str(self.order_id),
            "eventType": "order.confirmed",
            "status": "pending",
        }
        self.order = {
            "_id": self.order_id,
            "tenantId": "demo",
            "userId": self.user_id,
            "totalAmount": 1250,
            "address": {
                "fullName": "62/1, Demo Street",
                "phone": "9845459636",
                "country": "India",
            },
        }

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_order_confirmation_is_sent(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
        service: MagicMock,
    ):
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {
            "enabled": True,
            "notifications": {"orderConfirmation": True},
        }
        users.find_one.return_value = {"name": "Naveen"}
        tenants.find_one.return_value = {"name": "Demo Store"}
        service.return_value.send_text_message.return_value = {
            "data": {"id": "message-1"}
        }

        process_notification(str(self.notification_id))

        chat_id, message = service.return_value.send_text_message.call_args.args
        self.assertEqual(chat_id, "919845459636@c.us")
        self.assertIn("ORDER CONFIRMED", message)
        self.assertIn("Hi Naveen", message)
        self.assertNotIn("62/1, Demo Street", message)
        self.assertIn("Demo Store", message)
        self.assertIn(f"https://demo.{TENANT_BASE_DOMAIN}/orders", message)
        self.assertNotIn("localhost", message)
        self.assertNotIn("Shop now", message)
        sent_update = logs.update_one.call_args_list[-1].args[1]["$set"]
        self.assertEqual(sent_update["status"], "sent")
        self.assertEqual(sent_update["messageId"], "message-1")

    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_disabled_tenant_is_skipped(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
    ):
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": False}

        process_notification(str(self.notification_id))

        update = logs.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["status"], "skipped")

    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_national_phone_without_country_is_failed(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
    ):
        self.order["address"]["country"] = None
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {}
        tenants.find_one.return_value = {"name": "Demo Store"}

        process_notification(str(self.notification_id))

        update = logs.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["status"], "failed")

    def test_supported_event_messages(self):
        customer = {"name": "Naveen"}
        store = {"name": "Demo Store"}
        order = {
            "_id": self.order_id,
            "totalAmount": 1250,
            "courier": {"trackingUrl": "https://track.example/awb"},
        }
        expected = {
            "payment.succeeded": "PAYMENT SUCCESSFUL",
            "shipment.created": "ORDER SHIPPED",
            "order.delivered": "ORDER DELIVERED",
            "order.cancelled": "ORDER CANCELLED",
        }
        for event_type, title in expected.items():
            with self.subTest(event_type=event_type):
                self.assertIn(
                    title,
                    _message_for(event_type, order, customer, store),
                )
        shipped = _message_for("order.shipped", order, customer, store)
        self.assertIn("Track Order", shipped)
        self.assertIn("https://track.example/awb", shipped)

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_public_product_image_sends_rich_media(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
        service: MagicMock,
    ):
        self.order["items"] = [
            {
                "productId": ObjectId("6aaa564765a9517ecb24ac1d"),
                "name": "Graphic Check Overshirt",
                "image": "https://cdn.example/product.jpg",
            }
        ]
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {"name": "Naveen"}
        tenants.find_one.return_value = {
            "name": "Demo Store",
            "slug": "demo",
        }
        service.return_value.send_media_message.return_value = {
            "queue_id": "queue-1"
        }

        process_notification(str(self.notification_id))

        kwargs = service.return_value.send_media_message.call_args.kwargs
        self.assertEqual(kwargs["media_url"], "https://cdn.example/product.jpg")
        self.assertEqual(kwargs["mimetype"], "image/jpeg")
        message = service.return_value.send_media_message.call_args.args[1]
        self.assertIn("Graphic Check Overshirt", message)
        self.assertIn(
            f"https://demo.{TENANT_BASE_DOMAIN}/orders",
            message,
        )
        self.assertNotIn("6aaa564765a9517ecb24ac1d", message)
        service.return_value.send_text_message.assert_not_called()

    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_missing_phone_is_failed(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
    ):
        self.order["address"]["phone"] = ""
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {}
        tenants.find_one.return_value = {"name": "Demo Store"}

        process_notification(str(self.notification_id))

        update = logs.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["status"], "failed")

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.addresses")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    def test_logged_in_customer_can_send_product_to_own_whatsapp(
        self,
        integrations: MagicMock,
        users: MagicMock,
        addresses: MagicMock,
        tenants: MagicMock,
        logs: MagicMock,
        service: MagicMock,
    ):
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {
            "name": "Naveen",
            "phone": "9845459636",
        }
        addresses.find_one.return_value = {"country": "India"}
        tenants.find_one.return_value = {
            "name": "Demo Store",
            "slug": "demo",
        }
        logs.insert_one.return_value.inserted_id = ObjectId()
        service.return_value.send_media_message.return_value = {
            "queue_id": "queue-1"
        }
        product_id = ObjectId("6aaa564765a9517ecb24ac1d")

        result = share_product_with_customer(
            tenant_id="demo",
            user_id=str(self.user_id),
            product={
                "_id": product_id,
                "name": "Graphic Check Overshirt",
                "finalPrice": 999,
                "images": {
                    "Default": ["https://cdn.example/product.jpg"],
                },
            },
        )

        self.assertTrue(result["success"])
        chat_id, message = service.return_value.send_media_message.call_args.args
        self.assertEqual(chat_id, "919845459636@c.us")
        self.assertIn("Graphic Check Overshirt", message)
        self.assertIn(
            f"https://demo.{TENANT_BASE_DOMAIN}/product-details/"
            "6aaa564765a9517ecb24ac1d",
            message,
        )
        self.assertNotIn("localhost", message)


if __name__ == "__main__":
    unittest.main()
