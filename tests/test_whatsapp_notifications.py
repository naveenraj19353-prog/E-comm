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
        self.assertIn("Naveen, your order is confirmed", message)
        self.assertNotIn("62/1, Demo Street", message)
        self.assertIn("HEAD BACK TO DEMO STORE", message)
        self.assertIn("VIEW ORDER", message)
        self.assertIn(f"https://demo.{TENANT_BASE_DOMAIN}/orders", message)
        self.assertNotIn("localhost", message)
        self.assertNotIn("Shop now", message)
        self.assertNotIn("Open Admin", message)
        self.assertNotIn("NEW ORDER", message)
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

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
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
        service: MagicMock,
    ):
        self.order["address"]["country"] = None
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {}
        tenants.find_one.return_value = {"name": "Demo Store"}
        service.return_value.configured = False

        process_notification(str(self.notification_id))

        update = logs.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["status"], "failed")
        self.assertIn("country", str(update.get("error") or "").lower())

    def test_supported_event_messages(self):
        customer = {"name": "Naveen"}
        store = {"name": "Demo Store"}
        order = {
            "_id": self.order_id,
            "totalAmount": 1250,
            "courier": {"trackingUrl": "https://track.example/awb"},
        }
        expected = {
            "payment.succeeded": "payment received",
            "shipment.created": "on the way",
            "order.delivered": "it's here",
            "order.cancelled": "has been cancelled",
        }
        for event_type, title in expected.items():
            with self.subTest(event_type=event_type):
                self.assertIn(
                    title,
                    _message_for(event_type, order, customer, store),
                )
        shipped = _message_for("order.shipped", order, customer, store)
        self.assertIn("TRACK ORDER", shipped)
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

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
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
        service: MagicMock,
    ):
        self.order["address"]["phone"] = ""
        logs.find_one.return_value = self.notification
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {"enabled": True}
        users.find_one.return_value = {}
        tenants.find_one.return_value = {"name": "Demo Store"}
        service.return_value.configured = False

        process_notification(str(self.notification_id))

        update = logs.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["status"], "failed")
        self.assertIn("phone", str(update.get("error") or "").lower())

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
        self.assertIn("Naveen, why wait", message)
        self.assertIn("CHECKOUT NOW!", message)
        self.assertIn("HEAD BACK TO DEMO STORE", message)
        self.assertIn(
            f"https://demo.{TENANT_BASE_DOMAIN}/product-details/"
            "6aaa564765a9517ecb24ac1d",
            message,
        )
        self.assertNotIn("localhost", message)
        integrations.find_one.assert_not_called()

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.addresses")
    @patch("app.services.whatsapp_notification_service.users")
    def test_product_share_does_not_require_store_notification_toggle(
        self,
        users: MagicMock,
        addresses: MagicMock,
        tenants: MagicMock,
        logs: MagicMock,
        service: MagicMock,
    ):
        users.find_one.return_value = {
            "name": "Naveen",
            "phone": "9845459636",
        }
        addresses.find_one.return_value = {"country": "India"}
        tenants.find_one.return_value = {"name": "Demo Store", "slug": "demo"}
        logs.insert_one.return_value.inserted_id = ObjectId()
        service.return_value.configured = True
        service.return_value.send_text_message.return_value = {
            "queue_id": "queue-1"
        }

        result = share_product_with_customer(
            tenant_id="demo",
            user_id=str(self.user_id),
            product={
                "_id": ObjectId("6aa8de0de74ab7afd90745e6"),
                "name": "Paneer Pizza",
                "price": 299,
                "images": {},
            },
        )

        self.assertTrue(result["success"])
        chat_id, _message = service.return_value.send_text_message.call_args.args
        self.assertEqual(chat_id, "919845459636@c.us")

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.addresses")
    @patch("app.services.whatsapp_notification_service.users")
    def test_product_share_works_for_any_tenant_store(
        self,
        users: MagicMock,
        addresses: MagicMock,
        tenants: MagicMock,
        logs: MagicMock,
        service: MagicMock,
    ):
        users.find_one.return_value = {
            "name": "Naveen",
            "phone": "9845459636",
            "tenantId": "your-store",
        }
        addresses.find_one.return_value = {"country": "India"}
        tenants.find_one.return_value = {
            "name": "Vedic Paan",
            "slug": "vedic-paan",
        }
        logs.insert_one.return_value.inserted_id = ObjectId()
        service.return_value.configured = True
        service.return_value.send_text_message.return_value = {
            "queue_id": "queue-1"
        }

        result = share_product_with_customer(
            tenant_id="vedic-paan",
            user_id=str(self.user_id),
            product={
                "_id": ObjectId("6aa8de0de74ab7afd90745e6"),
                "name": "Meetha Paan",
                "price": 40,
                "images": {},
            },
        )

        self.assertTrue(result["success"])
        _chat_id, message = service.return_value.send_text_message.call_args.args
        self.assertIn("Vedic Paan", message)
        self.assertIn("vedic-paan", message)

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.shipping_locations")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_tenant_receives_new_order_alert(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
        shipping: MagicMock,
        service: MagicMock,
    ):
        logs.find_one.return_value = {**self.notification, "audience": "tenant"}
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {
            "enabled": True,
            "notifyPhone": "9876543210",
            "notifications": {"orderConfirmation": True},
        }
        users.find.return_value = []
        users.find_one.return_value = {"name": "Naveen"}
        tenants.find_one.return_value = {"name": "Demo Store", "slug": "demo"}
        shipping.find_one.return_value = None
        service.return_value.send_text_message.return_value = {
            "data": {"id": "store-1"}
        }

        process_notification(str(self.notification_id))

        chat_id, message = service.return_value.send_text_message.call_args.args
        self.assertEqual(chat_id, "919876543210@c.us")
        self.assertIn("NEW ORDER", message)
        self.assertIn("Naveen", message)
        self.assertIn("Demo Store", message)
        sent_update = logs.update_one.call_args_list[-1].args[1]["$set"]
        self.assertEqual(sent_update["status"], "sent")

    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.shipping_locations")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_tenant_receives_shipped_alert(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
        shipping: MagicMock,
        service: MagicMock,
    ):
        logs.find_one.return_value = {
            **self.notification,
            "eventType": "order.shipped",
            "audience": "tenant",
        }
        orders.find_one.return_value = self.order
        integrations.find_one.return_value = {
            "enabled": True,
            "notifyPhone": "9876543210",
            "notifications": {"shipmentUpdates": True},
        }
        users.find.return_value = []
        users.find_one.return_value = {"name": "Naveen"}
        tenants.find_one.return_value = {"name": "Demo Store", "slug": "demo"}
        shipping.find_one.return_value = None
        service.return_value.send_text_message.return_value = {
            "data": {"id": "store-2"}
        }

        process_notification(str(self.notification_id))

        _chat_id, message = service.return_value.send_text_message.call_args.args
        self.assertIn("ORDER SHIPPED", message)
        self.assertIn("Naveen", message)


    @patch("app.services.whatsapp_notification_service.PeriskopeService")
    @patch("app.services.whatsapp_notification_service.shipping_locations")
    @patch("app.services.whatsapp_notification_service.tenants")
    @patch("app.services.whatsapp_notification_service.users")
    @patch("app.services.whatsapp_notification_service.messaging_integrations")
    @patch("app.services.whatsapp_notification_service.orders")
    @patch("app.services.whatsapp_notification_service.notification_logs")
    def test_tenant_alert_skips_customer_phone(
        self,
        logs: MagicMock,
        orders: MagicMock,
        integrations: MagicMock,
        users: MagicMock,
        tenants: MagicMock,
        shipping: MagicMock,
        service: MagicMock,
    ):
        logs.find_one.return_value = {**self.notification, "audience": "tenant"}
        orders.find_one.return_value = {
            **self.order,
            "address": {
                "fullName": "Naveen Raj",
                "phone": "08088662317",
                "country": "India",
            },
        }
        integrations.find_one.return_value = {
            "enabled": True,
            "notifyPhone": "8088662317",
            "notifications": {"orderConfirmation": True},
        }
        users.find.return_value = [{"phone": "918088662317", "role": "admin"}]
        users.find_one.return_value = {"name": "Naveen Raj"}
        tenants.find_one.return_value = {
            "name": "Vedic Paan",
            "slug": "vedic-paan",
            "phone": "08088662317",
        }
        shipping.find_one.return_value = None

        process_notification(str(self.notification_id))

        service.return_value.send_text_message.assert_not_called()
        skipped = logs.update_one.call_args_list[-1].args[1]["$set"]
        self.assertEqual(skipped["status"], "skipped")

    def test_customer_confirmation_copy_is_not_admin_copy(self):
        message = _message_for(
            "order.confirmed",
            self.order,
            {"name": "Naveen Raj", "phone": "8088662317"},
            {"name": "Vedic Paan", "ordersUrl": "https://vedic-paan.example/orders"},
        )
        self.assertIn("your order is confirmed", message)
        self.assertNotIn("Open Admin", message)
        self.assertNotIn("NEW ORDER", message)
        self.assertNotIn("A customer placed an order", message)


if __name__ == "__main__":
    unittest.main()
