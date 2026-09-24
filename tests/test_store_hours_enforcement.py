import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException

from app.services import checkout_service


class AssertStoreOpenTests(unittest.TestCase):
    def test_open_store_does_not_raise(self):
        tenants = _FakeTenants({"storeHours": {"enabled": False}})
        with patch("app.database.mongo.tenants", tenants):
            checkout_service._assert_store_open("store-1")  # must not raise

    def test_closed_store_raises_409_with_custom_message(self):
        now = datetime.now(timezone.utc)
        hours = {
            "enabled": True,
            "defaultOpen": True,
            "message": "Back at 9am!",
            "windows": [
                {
                    "kind": "off",
                    "startAt": (now - timedelta(hours=1)).isoformat(),
                    "endAt": (now + timedelta(hours=1)).isoformat(),
                }
            ],
        }
        tenants = _FakeTenants({"storeHours": hours})
        with patch("app.database.mongo.tenants", tenants):
            with self.assertRaises(HTTPException) as context:
                checkout_service._assert_store_open("store-1")
        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(context.exception.detail, "Back at 9am!")

    def test_calculate_checkout_only_enforces_when_asked(self):
        # enforce_store_availability defaults to False so preview/staff calls aren't blocked.
        with patch.object(checkout_service, "_assert_store_open") as mock_assert:
            with patch.object(checkout_service, "_load_cart_items", side_effect=HTTPException(400, "x")):
                with self.assertRaises(HTTPException):
                    checkout_service.calculate_checkout("store-1", "user-1")
        mock_assert.assert_not_called()


class _FakeTenants:
    def __init__(self, doc):
        self.doc = doc

    def find_one(self, query, projection=None):
        return dict(self.doc)


if __name__ == "__main__":
    unittest.main()
