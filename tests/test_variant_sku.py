import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.models.product import CreateProduct, UpdateProduct
from app.routes import product as product_routes
from app.services.variant_sku import (
    assign_variant_ids_for_inventory,
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


class FakeProducts:
    """In-memory products collection. Validation must not query other
    products, so any read fails the test; inserts are recorded."""

    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.inserted = []

    def find(self, *args, **kwargs):
        raise AssertionError("variantId validation must not read other products")

    find_one = find

    def insert_one(self, doc):
        self.inserted.append(doc)
        return type("InsertResult", (), {"inserted_id": f"new-{len(self.inserted)}"})()


def _item(variant_id, color, size, stock=1):
    return {"variantId": variant_id, "color": color, "size": size, "stock": stock}


def _product(product_id, inventory, **fields):
    return {
        "_id": product_id,
        "tenantId": "store-a",
        "brand": fields.get("brand"),
        "categoryName": fields.get("categoryName", "Shirts"),
        "categoryId": fields.get("categoryId", "SHIRTS"),
        "inventory": inventory,
    }


class ProductVariantIdScopeTests(unittest.TestCase):
    """variantId is unique within a product only; stock is always looked up
    by productId + variantId, so different products may share one."""

    def setUp(self):
        self.shared = [
            _product("p-a", [_item("black-m", "Black", "M", 4)]),
            _product("p-b", [_item("black-m", "Black", "M", 7)]),
        ]
        self.products = FakeProducts(self.shared)

    def _edit(self, db_product, inventory):
        """Run the PUT /product/{id} preparation (the path that returned 409)."""
        with patch.object(product_routes, "products", self.products), patch.object(
            product_routes, "_validate_updated_images"
        ), patch.object(product_routes, "_update_final_price"):
            return product_routes._prepare_product_update(
                UpdateProduct(tenantId="store-a", inventory=inventory),
                db_product,
                "store-a",
            )

    def _create(self, inventory, *, name="Tee", category="Shirts", brand=None):
        payload = CreateProduct(
            tenantId="store-a",
            name=name,
            categoryId=category.upper(),
            categoryName=category,
            brand=brand,
            price=100,
            inventory=inventory,
        )
        with patch.object(product_routes, "products", self.products), patch.object(
            product_routes, "admin_tenant_id", return_value="store-a"
        ), patch.object(
            product_routes, "find_duplicate_product", return_value=None
        ), patch.object(
            product_routes, "validate_images", return_value={}
        ), patch.object(product_routes, "invalidate_tenant"):
            return product_routes.create_product(payload, current_user={"role": "admin"})

    # A. Same product + duplicate variantId -> rejected
    def test_duplicate_variant_id_within_product_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            product_routes.validate_inventory([
                _item("black-m", "Black", "M"),
                _item("black-m", "Black", "L"),
            ])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Duplicate variantId: black-m", error.exception.detail)

    def test_edit_that_generates_a_duplicate_variant_id_is_rejected(self):
        # "Light Blue" and "Light Pink" both abbreviate to LIG, so the new
        # variant gets the same generated SKU as the existing one.
        existing_id = generate_variant_sku(None, "Shirts", "Light Blue", "M")
        db_product = _product("p-c", [_item(existing_id, "Light Blue", "M")])

        with self.assertRaises(HTTPException) as error:
            self._edit(db_product, [
                _item(existing_id, "Light Blue", "M"),
                _item("new", "Light Pink", "M"),
            ])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Duplicate variantId", error.exception.detail)

    def test_duplicate_color_and_size_within_product_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            product_routes.validate_inventory([
                _item("v-1", "Black", "M"),
                _item("v-2", "black", "m"),
            ])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Duplicate color/size combination", error.exception.detail)

    def test_edit_with_duplicate_color_and_size_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            self._edit(self.shared[0], [
                _item("black-m", "Black", "M"),
                _item("other", "Black", "M"),
            ])
        self.assertEqual(error.exception.status_code, 400)

    # B. Different products + same variantId -> allowed
    def test_same_variant_id_on_different_products_is_allowed(self):
        update_data = self._edit(self.shared[1], [_item("black-m", "Black", "M", 7)])

        self.assertEqual(update_data["inventory"][0]["variantId"], "black-m")

    def test_create_allows_a_variant_id_another_product_already_uses(self):
        # Two brandless items in one category generate the same SKU
        # (e.g. GEN-SHIR-STA-OS); the second create used to fail with 409.
        first = self._create([_item("x", "Standard", "One Size")], name="Service one")
        second = self._create([_item("x", "Standard", "One Size")], name="Service two")

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        ids = [doc["inventory"][0]["variantId"] for doc in self.products.inserted]
        self.assertEqual(ids, ["GEN-SHIR-STA-OS", "GEN-SHIR-STA-OS"])

    # C. Existing product edit with unchanged variantIds -> succeeds
    def test_unchanged_edit_keeps_variant_ids_and_stock(self):
        inventory = [
            _item("NK-TS-BLK-M", "Black", "M", 10),
            _item("NK-TS-BLK-L", "Black", "L", 3),
        ]
        db_product = _product("p-d", inventory, brand="Nike")

        update_data = self._edit(db_product, [dict(item) for item in inventory])

        self.assertEqual(update_data["inventory"], inventory)
        self.assertEqual(update_data["totalStock"], 13)

    # D. Products sharing legacy variantIds remain editable
    def test_products_sharing_legacy_variant_ids_remain_editable(self):
        legacy = [
            _product("svc-1", [_item("standard-one-size", "Standard", "One Size")]),
            _product("svc-2", [_item("standard-one-size", "Standard", "One Size")]),
            _product("menu-1", [_item("default-default", "Default", "Default")]),
            _product("menu-2", [_item("default-default", "Default", "Default")]),
            _product("ret-1", [_item("black-one-size", "Black", "One Size")]),
            _product("ret-2", [_item("black-one-size", "Black", "One Size")]),
            _product("ret-3", [_item("gold-blue-one-size", "Gold Blue", "One Size")]),
            _product("ret-4", [_item("gold-blue-one-size", "Gold Blue", "One Size")]),
            _product("qa-1", [_item("v1", "Red", "S")]),
            _product("qa-2", [_item("v1", "Red", "S")]),
        ]
        self.products = FakeProducts(legacy)

        for db_product in legacy:
            with self.subTest(product=db_product["_id"]):
                sent = [dict(item) for item in db_product["inventory"]]
                update_data = self._edit(db_product, sent)
                self.assertEqual(
                    update_data["inventory"][0]["variantId"],
                    db_product["inventory"][0]["variantId"],
                )

    # E. Create with a duplicate variantId inside the same product -> rejected
    def test_create_with_generated_duplicate_variant_id_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            self._create([
                _item("a", "Light Blue", "M"),
                _item("b", "Light Pink", "M"),
            ])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Duplicate variantId", error.exception.detail)
        self.assertEqual(self.products.inserted, [])

    def test_create_with_duplicate_color_and_size_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            self._create([
                _item("a", "Black", "M"),
                _item("b", "Black", "M"),
            ])
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.products.inserted, [])


if __name__ == "__main__":
    unittest.main()
