import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId

from app.routes import tenant as tenant_routes
from app.services import billing_service


class _NoWrites:
    def update_one(self, *args, **kwargs):
        pass


class PublicStorefrontTenantTests(unittest.TestCase):
    def _tenant(self, **billing):
        return {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "slug": "store-1",
            "name": "Store One",
            "password": "hashed",
            "resetToken": "secret",
            "platformCommissionPercent": 3.5,
            "billing": billing,
        }

    def test_hides_billing_commission_and_secrets(self):
        tenant = self._tenant(
            status="past_due",
            graceEndsAt=datetime.now(timezone.utc) + timedelta(days=3),
        )
        with patch.object(billing_service, "tenants", _NoWrites()):
            payload = tenant_routes._public_storefront_tenant(tenant)
        for field in ("billing", "platformCommissionPercent", "password", "resetToken"):
            self.assertNotIn(field, payload)
        # Past due but still inside grace: storefront stays up.
        self.assertTrue(payload["storeAvailable"])

    def test_suspended_store_is_reported_unavailable(self):
        tenant = self._tenant(status="suspended")
        with patch.object(billing_service, "tenants", _NoWrites()):
            payload = tenant_routes._public_storefront_tenant(tenant)
        self.assertFalse(payload["storeAvailable"])

    def test_grandfathered_store_is_available(self):
        tenant = self._tenant()
        tenant.pop("billing")
        payload = tenant_routes._public_storefront_tenant(tenant)
        self.assertTrue(payload["storeAvailable"])


if __name__ == "__main__":
    unittest.main()
