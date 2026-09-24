import unittest
from unittest.mock import patch

from bson import ObjectId

from app.services import tenant_service


class FakeCollection:
    """Minimal find_one/update_one/update_many/insert_one fake over a dict store."""

    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    @staticmethod
    def _matches(doc, query):
        for key, expected in query.items():
            if isinstance(expected, dict) and "$exists" in expected:
                if (key in doc) != expected["$exists"]:
                    return False
                continue
            if doc.get(key) != expected:
                return False
        return True

    def update_one(self, query, update):
        for doc in self.docs:
            if doc.get("_id") == query.get("_id"):
                doc.update(update.get("$set", {}))
                for field in update.get("$unset", {}):
                    doc.pop(field, None)
                return
        raise AssertionError("no matching document")

    def update_many(self, query, update):
        for doc in self.docs:
            if doc.get("tenantId") == query.get("tenantId"):
                doc.update(update.get("$set", {}))
                for field in update.get("$unset", {}):
                    doc.pop(field, None)


class TenantIdInUseTests(unittest.TestCase):
    def test_free_tenant_id_is_not_in_use(self):
        with patch.object(tenant_service, "tenants", FakeCollection()), patch.object(
            tenant_service, "users", FakeCollection()
        ), patch.object(tenant_service, "orders", FakeCollection()), patch.object(
            tenant_service, "products", FakeCollection()
        ):
            self.assertFalse(tenant_service.tenant_id_in_use("fresh-store"))

    def test_tenant_id_left_behind_by_a_deleted_store_is_still_in_use(self):
        # Regression: a soft-deleted tenant document is kept (see soft_delete_tenant),
        # but even orphaned orders/users from a hard-deleted one must block reuse.
        with patch.object(tenant_service, "tenants", FakeCollection()), patch.object(
            tenant_service, "users", FakeCollection()
        ), patch.object(
            tenant_service, "orders", FakeCollection([{"tenantId": "old-store"}])
        ), patch.object(tenant_service, "products", FakeCollection()):
            self.assertTrue(tenant_service.tenant_id_in_use("old-store"))

    def test_available_tenant_id_falls_back_to_a_suffixed_candidate(self):
        with patch.object(
            tenant_service, "tenants", FakeCollection([{"tenantId": "taken-slug"}])
        ), patch.object(tenant_service, "users", FakeCollection()), patch.object(
            tenant_service, "orders", FakeCollection()
        ), patch.object(tenant_service, "products", FakeCollection()):
            result = tenant_service.available_tenant_id("taken-slug")
            self.assertNotEqual(result, "taken-slug")
            self.assertTrue(result.startswith("taken-slug-"))


class SoftDeleteTenantTests(unittest.TestCase):
    def test_deleted_tenant_frees_slug_and_email_but_keeps_tenant_id(self):
        object_id = ObjectId()
        tenant_doc = {
            "_id": object_id,
            "tenantId": "store-1",
            "slug": "store-1",
            "email": "owner@store-1.example",
            "password": "hashed",
            "isActive": True,
        }
        tenants_fake = FakeCollection([tenant_doc])
        users_fake = FakeCollection(
            [{"_id": ObjectId(), "tenantId": "store-1", "role": "customer", "isActive": True}]
        )
        with patch.object(tenant_service, "tenants", tenants_fake), patch.object(
            tenant_service, "users", users_fake
        ):
            self.assertTrue(tenant_service.soft_delete_tenant(object_id))

        updated = tenants_fake.docs[0]
        self.assertNotIn("slug", updated)
        self.assertNotIn("email", updated)
        self.assertNotIn("password", updated)
        self.assertEqual(updated["tenantId"], "store-1")
        self.assertFalse(updated["isActive"])
        self.assertIn("deletedAt", updated)

        for user in users_fake.docs:
            self.assertFalse(user["isActive"])

    def test_deleting_an_already_deleted_tenant_is_a_no_op(self):
        object_id = ObjectId()
        tenants_fake = FakeCollection(
            [{"_id": object_id, "tenantId": "store-1", "deletedAt": "already"}]
        )
        with patch.object(tenant_service, "tenants", tenants_fake), patch.object(
            tenant_service, "users", FakeCollection()
        ):
            self.assertFalse(tenant_service.soft_delete_tenant(object_id))


if __name__ == "__main__":
    unittest.main()
