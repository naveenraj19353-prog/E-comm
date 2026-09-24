import unittest
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.routes import product as product_routes


class FakeProducts:
    def __init__(self, docs):
        self.docs = docs

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None


class ShareProductOnWhatsappTenantScopeTests(unittest.TestCase):
    """Regression test: a customer of one store must not be able to reach,
    let alone WhatsApp-share, a product that belongs to a different store."""

    def setUp(self):
        self.other_tenant_product = {
            "_id": ObjectId(),
            "tenantId": "store-b",
            "isActive": True,
            "name": "Store B's Secret Product",
        }
        self.own_product = {
            "_id": ObjectId(),
            "tenantId": "store-a",
            "isActive": True,
            "name": "Store A's Product",
        }
        self.current_user = {"role": "customer", "tenantId": "store-a", "userId": "u1"}

    def test_customer_cannot_share_another_tenants_product(self):
        fake_products = FakeProducts([self.other_tenant_product])
        with patch.object(product_routes, "products", fake_products):
            with self.assertRaises(HTTPException) as context:
                product_routes.share_product_on_whatsapp(
                    str(self.other_tenant_product["_id"]),
                    self.current_user,
                )
        self.assertEqual(context.exception.status_code, 404)

    def test_customer_can_share_own_tenants_product(self):
        fake_products = FakeProducts([self.own_product])
        with patch.object(product_routes, "products", fake_products), patch.object(
            product_routes,
            "share_product_with_customer",
            return_value={"success": True},
        ) as mock_share:
            result = product_routes.share_product_on_whatsapp(
                str(self.own_product["_id"]),
                self.current_user,
            )
        self.assertEqual(result, {"success": True})
        # The tenant used downstream must be the caller's own tenant, never a
        # value read off the product document.
        mock_share.assert_called_once_with(
            tenant_id="store-a",
            user_id="u1",
            product=self.own_product,
        )


if __name__ == "__main__":
    unittest.main()
