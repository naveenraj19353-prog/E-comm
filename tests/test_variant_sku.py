import unittest

from fastapi import HTTPException

from app.services.variant_sku import (
    assign_variant_ids_for_inventory,
    ensure_unique_variant_ids_for_tenant,
    generate_variant_sku,
)


class VariantSkuTests(unittest.TestCase):
    def test_generates_business_readable_sku(self):
        self.assertEqual(
            generate_variant_sku("aa", "test", "red", "xl"),
            "AA-TEST-RED-XL",
        )
        self.assertEqual(
            generate_variant_sku("brand", "shoes", "black", "9"),
            "BR-SHOE-BLA-9",
        )
        self.assertEqual(
            generate_variant_sku("", "Shirt", "White", "XL"),
            "GEN-SHIR-WHI-XL",
        )

    def test_existing_variant_id_is_preserved_for_same_color_and_size(self):
        product = {
            "brand": "Nike",
            "categoryName": "T-Shirt",
            "categoryId": "APPAREL",
        }
        existing_inventory = [{
            "variantId": "NK-TS-BLK-M",
            "color": "Black",
            "size": "M",
            "stock": 10,
        }]
        inventory = [{
            "color": "Black",
            "size": "M",
            "stock": 5,
        }]

        prepared = assign_variant_ids_for_inventory(
            product,
            inventory,
            existing_inventory=existing_inventory,
        )

        self.assertEqual(prepared[0]["variantId"], "NK-TS-BLK-M")

    def test_duplicate_sku_is_rejected_within_tenant_scope(self):
        class FakeProductsCollection:
            def find(self, query, projection=None):
                return [{
                    "_id": "p-1",
                    "tenantId": "tenant-1",
                    "inventory": [{"variantId": "NK-TS-BLK-M"}],
                }]

        with self.assertRaises(HTTPException):
            ensure_unique_variant_ids_for_tenant(
                "tenant-1",
                [{"variantId": "NK-TS-BLK-M"}],
                products_collection=FakeProductsCollection(),
            )


if __name__ == "__main__":
    unittest.main()
