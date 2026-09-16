import unittest
from unittest.mock import Mock, patch

from app.services.periskope_service import PeriskopeError, PeriskopeService


class PeriskopeServiceTests(unittest.TestCase):
    def test_send_message_uses_documented_endpoint_and_headers(self):
        response = Mock(ok=True, content=b'{"data":{"id":"message-1"}}')
        response.json.return_value = {"data": {"id": "message-1"}}
        response.status_code = 200
        with patch(
            "app.services.periskope_service.requests.request",
            return_value=response,
        ) as request:
            service = PeriskopeService(
                api_key="secret",
                phone="919876543210",
                base_url="https://api.periskope.app/v1",
            )
            result = service.send_text_message(
                "919845459636@c.us",
                "Order confirmed",
            )

        self.assertEqual(result["data"]["id"], "message-1")
        request.assert_called_once()
        args, kwargs = request.call_args
        self.assertEqual(args[:2], ("POST", "https://api.periskope.app/v1/message/send"))
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer secret")
        self.assertEqual(kwargs["headers"]["x-phone"], "919876543210")
        self.assertEqual(kwargs["json"]["chat_id"], "919845459636@c.us")

    def test_missing_credentials_fail_without_network_call(self):
        with patch("app.services.periskope_service.requests.request") as request:
            service = PeriskopeService(api_key="", phone="")
            with self.assertRaises(PeriskopeError) as context:
                service.health_check()
        self.assertEqual(context.exception.code, "NOT_CONFIGURED")
        request.assert_not_called()

    def test_normalizes_ten_digit_indian_sender(self):
        service = PeriskopeService(api_key="secret", phone="9845459636")
        self.assertEqual(service._headers()["x-phone"], "919845459636")

    def test_media_message_uses_documented_payload(self):
        response = Mock(ok=True, content=b'{"queue_id":"queue-1"}', status_code=200)
        response.json.return_value = {"queue_id": "queue-1"}
        with patch(
            "app.services.periskope_service.requests.request",
            return_value=response,
        ) as request:
            service = PeriskopeService(api_key="secret", phone="919876543210")
            service.send_media_message(
                "919845459636@c.us",
                "*Order Update*",
                media_url="https://cdn.example/order.jpg",
                filename="order-update.jpg",
                mimetype="image/jpeg",
            )
        payload = request.call_args.kwargs["json"]
        self.assertEqual(payload["media"]["type"], "image")
        self.assertEqual(payload["media"]["url"], "https://cdn.example/order.jpg")
        self.assertEqual(payload["message"], "*Order Update*")

    def test_provider_failure_is_sanitized(self):
        response = Mock(ok=False, content=b"secret provider detail", status_code=401)
        with patch(
            "app.services.periskope_service.requests.request",
            return_value=response,
        ):
            service = PeriskopeService(api_key="secret", phone="919876543210")
            with self.assertRaises(PeriskopeError) as context:
                service.health_check()
        self.assertEqual(str(context.exception), "Periskope rejected the request.")


if __name__ == "__main__":
    unittest.main()
