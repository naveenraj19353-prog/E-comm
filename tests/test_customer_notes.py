"""Internal customer notes (REQ-065)."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.user import CustomerNoteRequest
from app.routes import users as users_routes
from tests.mongo_fakes import FakeCollection

OWNER = {"userId": "owner-1", "name": "Owner", "role": "admin", "tenantId": "store-a"}
MANAGER = {"userId": "mgr-1", "name": "Priya", "role": "store_manager", "tenantId": "store-a",
           "permissions": {"customers": True}}
OTHER_MANAGER = {**MANAGER, "userId": "mgr-2", "name": "Ravi"}
OTHER_STORE = {**OWNER, "tenantId": "store-b"}


class CustomerNotesTests(unittest.TestCase):
    def setUp(self):
        self.customer_id = ObjectId()
        self.other_store_customer = ObjectId()
        self.users = FakeCollection("users")
        self.users.docs.extend(
            [
                {"_id": self.customer_id, "tenantId": "store-a", "role": "customer", "name": "Asha"},
                {"_id": self.other_store_customer, "tenantId": "store-b", "role": "customer"},
            ]
        )
        self.notes = FakeCollection("customer_notes")
        for patcher in (
            patch.object(users_routes, "users", self.users),
            patch.object(users_routes, "customer_notes", self.notes),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def add(self, text, user=MANAGER, customer=None):
        payload = CustomerNoteRequest(text=text)
        return users_routes.add_customer_note(str(customer or self.customer_id), payload, user)["data"]

    def listed(self, user=OWNER):
        return users_routes.list_customer_notes(str(self.customer_id), user)["data"]

    def test_notes_are_saved_with_author_and_time_newest_first(self):
        times = [datetime(2026, 9, 25, 10, tzinfo=timezone.utc), datetime(2026, 9, 25, 11, tzinfo=timezone.utc)]
        with patch.object(users_routes, "datetime") as clock:
            clock.now.side_effect = times
            self.add("Prefers evening delivery")
            self.add("  Asked for gift wrap  ", user=OWNER)

        notes = self.listed()
        self.assertEqual([note["text"] for note in notes], ["Asked for gift wrap", "Prefers evening delivery"])
        self.assertEqual(notes[1]["authorName"], "Priya")
        self.assertTrue(notes[0]["createdAt"])
        stored = self.notes.docs[0]
        self.assertEqual((stored["tenantId"], stored["customerId"], stored["authorId"]), ("store-a", self.customer_id, "mgr-1"))

    def test_only_the_author_or_the_owner_can_delete(self):
        note = self.add("Called about a refund")

        self.assertFalse(self.listed(user=OTHER_MANAGER)[0]["canDelete"])
        with self.assertRaises(HTTPException) as error:
            users_routes.delete_customer_note(str(self.customer_id), note["id"], OTHER_MANAGER)
        self.assertEqual(error.exception.status_code, 403)

        self.assertTrue(self.listed(user=MANAGER)[0]["canDelete"])
        self.assertTrue(self.listed(user=OWNER)[0]["canDelete"])
        users_routes.delete_customer_note(str(self.customer_id), note["id"], OWNER)
        self.assertEqual(self.notes.docs, [])

    def test_other_stores_cannot_see_or_add_notes(self):
        self.add("Store A only")
        with self.assertRaises(HTTPException) as error:
            users_routes.list_customer_notes(str(self.customer_id), OTHER_STORE)
        self.assertEqual(error.exception.status_code, 404)
        with self.assertRaises(HTTPException):
            self.add("Sneaky", customer=self.other_store_customer)

    def test_note_text_is_validated(self):
        for bad in ("", "   ", "x" * 1001):
            with self.subTest(length=len(bad)), self.assertRaises(ValidationError):
                CustomerNoteRequest(text=bad)
        with self.assertRaises(ValidationError):
            CustomerNoteRequest(text="ok", customerId="someone-else")

    def test_unknown_or_invalid_note_ids(self):
        with self.assertRaises(HTTPException) as error:
            users_routes.delete_customer_note(str(self.customer_id), "not-an-id", OWNER)
        self.assertEqual(error.exception.status_code, 400)
        with self.assertRaises(HTTPException) as error:
            users_routes.delete_customer_note(str(self.customer_id), str(ObjectId()), OWNER)
        self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
