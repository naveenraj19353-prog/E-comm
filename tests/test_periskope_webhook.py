import hashlib
import hmac
import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from starlette.requests import Request

from app.routes.periskope_webhook import periskope_webhook


def request_for(payload: dict, secret: str, *, valid: bool = True) -> Request:
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not valid:
        signature = "invalid"
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/webhooks/periskope",
        "headers": [(b"x-periskope-signature", signature.encode())],
    }
    return Request(scope, receive)


class PeriskopeWebhookTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_signature_is_rejected(self):
        with patch(
            "app.routes.periskope_webhook.PERISKOPE_WEBHOOK_SIGNING_KEY",
            "signing-secret",
        ):
            with self.assertRaises(HTTPException) as context:
                await periskope_webhook(
                    request_for(
                        {"event_type": "message.created", "data": {}},
                        "signing-secret",
                        valid=False,
                    )
                )
        self.assertEqual(context.exception.status_code, 401)

    @patch("app.routes.periskope_webhook.notification_logs")
    @patch("app.routes.periskope_webhook.periskope_webhook_events")
    async def test_duplicate_event_returns_success(
        self,
        events: MagicMock,
        logs: MagicMock,
    ):
        events.insert_one.side_effect = DuplicateKeyError("duplicate")
        logs.find_one.return_value = None
        payload = {
            "event_type": "message.created",
            "data": {"id": "message-1", "chat_id": "919845459636@c.us"},
            "org_id": "org-1",
            "timestamp": "2026-09-16T09:30:00Z",
        }
        with patch(
            "app.routes.periskope_webhook.PERISKOPE_WEBHOOK_SIGNING_KEY",
            "signing-secret",
        ):
            result = await periskope_webhook(
                request_for(payload, "signing-secret")
            )
        self.assertEqual(result["status"], "duplicate")


if __name__ == "__main__":
    unittest.main()
