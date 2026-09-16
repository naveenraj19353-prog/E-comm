import unittest

from fastapi import HTTPException

from app.utils.auth_dependencies import admin_tenant_id


class PeriskopeTenantIsolationTests(unittest.TestCase):
    def test_tenant_admin_cannot_select_another_tenant(self):
        with self.assertRaises(HTTPException) as context:
            admin_tenant_id(
                {"role": "admin", "tenantId": "tenant-a"},
                "tenant-b",
            )
        self.assertEqual(context.exception.status_code, 403)

    def test_super_admin_must_select_tenant(self):
        with self.assertRaises(HTTPException) as context:
            admin_tenant_id({"role": "super_admin"}, None)
        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
