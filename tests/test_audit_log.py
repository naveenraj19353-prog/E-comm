import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.services.audit_log import record_audit_event


class AuditLogTests(unittest.TestCase):
    def test_records_actor_entity_and_safe_before_after_values(self):
        collection = MagicMock()
        before = {
            "_id": ObjectId(),
            "name": "Store",
            "password": "do-not-store",
            "nested": {"token": "also-do-not-store", "enabled": True},
        }
        after = {"name": "Updated Store"}

        with patch("app.services.audit_log.audit_logs", collection):
            record_audit_event(
                action="tenant.updated",
                actor={
                    "userId": "u1",
                    "name": "Owner",
                    "email": "owner@example.com",
                    "role": "admin",
                },
                tenant_id=" Store-A ",
                entity_type="tenant",
                entity_id=before["_id"],
                before=before,
                after=after,
            )

        document = collection.insert_one.call_args.args[0]
        self.assertEqual(document["tenantId"], "store-a")
        self.assertEqual(document["actor"]["userId"], "u1")
        self.assertEqual(document["entity"]["id"], str(before["_id"]))
        self.assertNotIn("password", document["before"])
        self.assertNotIn("token", document["before"]["nested"])
        self.assertEqual(document["before"]["nested"]["enabled"], True)
        self.assertEqual(document["after"], after)
        self.assertIsInstance(document["createdAt"], datetime)
        self.assertEqual(document["createdAt"].tzinfo, timezone.utc)

    def test_empty_optional_identity_values_are_stored_as_none(self):
        collection = MagicMock()

        with patch("app.services.audit_log.audit_logs", collection):
            record_audit_event(
                action="tenant.deleted",
                actor={},
                entity_type="tenant",
            )

        document = collection.insert_one.call_args.args[0]
        self.assertIsNone(document["tenantId"])
        self.assertIsNone(document["actor"]["userId"])
        self.assertIsNone(document["entity"]["id"])

    def test_write_failure_is_logged_and_never_breaks_the_caller(self):
        """The route must 200 even when the audit store is unreachable."""
        collection = MagicMock()
        collection.insert_one.side_effect = RuntimeError("mongo down")

        with patch("app.services.audit_log.audit_logs", collection):
            with self.assertLogs("app.services.audit_log", level="ERROR") as captured:
                record_audit_event(
                    action="tenant.updated",
                    actor={"userId": "u1"},
                    tenant_id="store-a",
                    entity_type="tenant",
                    entity_id="t1",
                    after={"name": "New Name"},
                )

        collection.insert_one.assert_called_once()
        self.assertTrue(
            any("tenant.updated" in line for line in captured.output),
            "the failed audit write should be logged with its action",
        )


if __name__ == "__main__":
    unittest.main()
