import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.services.contact_service import create_contact_message, list_contact_messages


class FakeContacts:
    def __init__(self):
        self.docs = []

    def count_documents(self, query):
        return len(self.docs)

    def insert_one(self, payload):
        payload["_id"] = ObjectId()
        self.docs.append(payload)
        return type("Result", (), {"inserted_id": payload["_id"]})()

    def find(self, query):
        class Cursor(list):
            def sort(self, *_args, **_kwargs):
                return self

        return Cursor(self.docs)


class ContactServiceTests(unittest.TestCase):
    def test_rejects_invalid_email(self):
        with (
            patch(
                "app.services.contact_service.tenants.find_one",
                return_value={"tenantId": "store-1"},
            ),
            self.assertRaises(HTTPException) as error,
        ):
            create_contact_message(
                tenant_id="store-1",
                name="Naveen",
                email="not-an-email",
                phone="",
                message="I need help with my order today.",
            )
        self.assertEqual(error.exception.status_code, 400)

    def test_creates_message_for_active_store(self):
        fake = FakeContacts()
        with (
            patch(
                "app.services.contact_service.tenants.find_one",
                return_value={"tenantId": "store-1"},
            ),
            patch("app.services.contact_service.contact_messages", fake),
        ):
            doc = create_contact_message(
                tenant_id="store-1",
                name="Naveen",
                email="naveen@example.com",
                phone="9876543210",
                message="Please call me about a delayed parcel.",
            )
        self.assertEqual(doc["tenantId"], "store-1")
        self.assertEqual(doc["status"], "new")
        self.assertEqual(doc["email"], "naveen@example.com")

    def test_rate_limit_after_five(self):
        fake = FakeContacts()
        fake.docs = [
            {
                "_id": ObjectId(),
                "tenantId": "store-1",
                "email": "naveen@example.com",
                "createdAt": datetime.now(timezone.utc),
            }
            for _ in range(5)
        ]
        with (
            patch(
                "app.services.contact_service.tenants.find_one",
                return_value={"tenantId": "store-1"},
            ),
            patch("app.services.contact_service.contact_messages", fake),
            self.assertRaises(HTTPException) as error,
        ):
            create_contact_message(
                tenant_id="store-1",
                name="Naveen",
                email="naveen@example.com",
                phone="",
                message="This is another follow-up message.",
            )
        self.assertEqual(error.exception.status_code, 429)

    def test_list_serializes(self):
        fake = FakeContacts()
        fake.docs = [
            {
                "_id": ObjectId(),
                "name": "A",
                "email": "a@example.com",
                "phone": "",
                "message": "Hello there friend.",
                "status": "new",
                "createdAt": datetime.now(timezone.utc),
            }
        ]
        with patch("app.services.contact_service.contact_messages", fake):
            rows = list_contact_messages("store-1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "A")


if __name__ == "__main__":
    unittest.main()
