import unittest
from unittest.mock import patch

from app.models.product import CreateProduct, UpdateProduct
from app.routes import product as product_routes


def _prepare(payload: dict) -> dict:
    with patch.object(product_routes, "_validate_updated_images"), patch.object(
        product_routes, "_update_final_price"
    ):
        return product_routes._prepare_product_update(
            UpdateProduct(tenantId="store-a", **payload), {"_id": "p1"}, "store-a"
        )


class ProductDraftTests(unittest.TestCase):
    def test_create_defaults_to_published(self):
        model = CreateProduct(tenantId="store-a", name="Tee", categoryId="TSHIRTS", price=100, discountPercentage=0)
        self.assertFalse(model.isDraft)

    def test_marking_draft_hides_product(self):
        data = _prepare({"isDraft": True})
        self.assertIs(data["isActive"], False)

    def test_publishing_clears_draft(self):
        data = _prepare({"isActive": True})
        self.assertIs(data["isDraft"], False)

    def test_other_edits_leave_draft_alone(self):
        data = _prepare({"name": "New name"})
        self.assertNotIn("isDraft", data)
        self.assertNotIn("isActive", data)


if __name__ == "__main__":
    unittest.main()
