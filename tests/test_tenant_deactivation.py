import unittest
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.models.tenant import UpdateTenant
from app.routes import tenant as tenant_routes
from app.utils import auth_dependencies
from app.utils.jwt_handler import create_token


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs
        self.updates = []

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items() if not isinstance(v, dict)):
                return dict(doc)
        return None

    def update_one(self, query, update):
        self.updates.append(update)

        class _Result:
            matched_count = 1

        return _Result()


class SessionOfDeactivatedStoreTests(unittest.TestCase):
    def _credentials(self, user):
        token = create_token({"userId": str(user["_id"]), "tenantId": user["tenantId"],
                              "email": user["email"], "role": user["role"], "name": "x"})
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def _user(self, role):
        return {"_id": ObjectId(), "tenantId": "store-1", "email": "u@example.com", "role": role, "isActive": True}

    def test_customer_of_inactive_store_is_rejected(self):
        user = self._user("customer")
        with patch.object(auth_dependencies, "users", _FakeCollection([user])), patch.object(
            auth_dependencies, "tenants", _FakeCollection([{"tenantId": "store-1", "isActive": False}])
        ):
            with self.assertRaises(HTTPException) as context:
                auth_dependencies.get_current_user(self._credentials(user))
        self.assertEqual(context.exception.status_code, 401)

    def test_manager_of_inactive_store_is_rejected(self):
        user = self._user("store_manager")
        with patch.object(auth_dependencies, "users", _FakeCollection([user])), patch.object(
            auth_dependencies, "tenants", _FakeCollection([{"tenantId": "store-1", "isActive": False}])
        ):
            with self.assertRaises(HTTPException):
                auth_dependencies.get_current_user(self._credentials(user))

    def test_customer_of_active_store_is_allowed(self):
        user = self._user("customer")
        with patch.object(auth_dependencies, "users", _FakeCollection([user])), patch.object(
            auth_dependencies, "tenants", _FakeCollection([{"tenantId": "store-1", "isActive": True}])
        ):
            result = auth_dependencies.get_current_user(self._credentials(user))
        self.assertEqual(result["tenantId"], "store-1")


class OnlySuperAdminTogglesActiveTests(unittest.TestCase):
    def setUp(self):
        self.tenant = {"_id": ObjectId(), "tenantId": "store-1", "name": "Store", "isActive": True}
        self.owner = {"role": "admin", "tenantId": "store-1"}

    def _update(self, payload, user):
        fake = _FakeCollection([self.tenant])
        with patch.object(tenant_routes, "tenants", fake):
            tenant_routes.update_tenant(str(self.tenant["_id"]), payload, user)
        return fake

    def test_owner_cannot_deactivate_own_store(self):
        with self.assertRaises(HTTPException) as context:
            self._update(UpdateTenant(isActive=False), self.owner)
        self.assertEqual(context.exception.status_code, 403)

    def test_owner_saving_form_with_unchanged_status_still_works(self):
        fake = self._update(UpdateTenant(name="New Name", isActive=True), self.owner)
        applied = fake.updates[0]["$set"]
        self.assertEqual(applied["name"], "New Name")
        self.assertNotIn("isActive", applied)

    def test_super_admin_can_deactivate(self):
        fake = self._update(UpdateTenant(isActive=False), {"role": "super_admin", "tenantId": None})
        self.assertIs(fake.updates[0]["$set"]["isActive"], False)


if __name__ == "__main__":
    unittest.main()
