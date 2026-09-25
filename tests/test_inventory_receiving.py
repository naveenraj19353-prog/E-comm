import copy
import inspect
import re
import unittest
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.inventory_receiving import (
    ReceivingPreviewRequest,
    ReceivingPreviewResponse,
    ReceivingVariantInput,
)
from app.routes import inventory as inventory_routes
from app.services import inventory_receiving, product_duplicates

NIKE_ID = ObjectId()
OTHER_STORE_ID = ObjectId()
SHARED_A_ID = ObjectId()
SHARED_B_ID = ObjectId()
LEGACY_ID = ObjectId()
LIGHT_ID = ObjectId()

PRODUCTS = [
    {
        "_id": NIKE_ID,
        "tenantId": "store-a",
        "name": "Nike T-Shirt",
        "brand": "Nike",
        "categoryId": "T_SHIRTS",
        "categoryName": "T-Shirts",
        "isActive": True,
        "isDraft": False,
        "stock": 160,
        "totalStock": 160,
        "inventory": [
            {"variantId": "NK-TS-BLK-S", "color": "Black", "size": "S", "stock": 20},
            {"variantId": "NK-TS-BLK-M", "color": "Black", "size": "M", "stock": 100},
            {"variantId": "NK-TS-YLW-M", "color": "Yellow", "size": "M", "stock": 40},
        ],
    },
    {
        "_id": OTHER_STORE_ID,
        "tenantId": "store-b",
        "name": "Nike T-Shirt",
        "categoryId": "T_SHIRTS",
        "categoryName": "T-Shirts",
        "isActive": True,
        "inventory": [{"variantId": "B-ONLY", "color": "Red", "size": "S", "stock": 5}],
    },
    {
        "_id": SHARED_A_ID,
        "tenantId": "store-a",
        "name": "Bridal Makeup",
        "categoryId": "SERVICES",
        "categoryName": "Services",
        "isActive": True,
        "inventory": [{"variantId": "standard-one-size", "color": "Standard", "size": "One Size", "stock": 1}],
    },
    {
        "_id": SHARED_B_ID,
        "tenantId": "store-a",
        "name": "Mehendi",
        "categoryId": "SERVICES",
        "categoryName": "Services",
        "isActive": True,
        "inventory": [{"variantId": "standard-one-size", "color": "Standard", "size": "One Size", "stock": 1}],
    },
    {
        "_id": LEGACY_ID,
        "tenantId": "store-a",
        "name": "Gold Studs",
        "categoryId": "JEWELLERY",
        "categoryName": "Jewellery",
        "isActive": False,
        "isDraft": True,
        "inventory": [{"variantId": "gold-blue-one-size", "color": "Gold Blue", "size": "One Size", "stock": 3}],
    },
    {
        "_id": LIGHT_ID,
        "tenantId": "store-a",
        "name": "Linen Shirt",
        "categoryId": "SHIRTS",
        "categoryName": "Shirts",
        "isActive": True,
        "inventory": [{"variantId": "GEN-SHIR-LIG-M", "color": "Light Blue", "size": "M", "stock": 2}],
    },
]


def _values(doc, path):
    values = [doc]
    for part in path.split("."):
        found = []
        for value in values:
            if isinstance(value, dict) and part in value:
                inner = value[part]
                found.extend(inner if isinstance(inner, list) else [inner])
        values = found
    return values


def _matches(doc, query):
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(doc, sub) for sub in condition):
                return False
            continue
        values = _values(doc, key)
        if isinstance(condition, dict) and any(op.startswith("$") for op in condition):
            for op, operand in condition.items():
                if op == "$in":
                    ok = any(value in operand for value in values)
                elif op == "$regex":
                    flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
                    ok = any(isinstance(value, str) and re.search(operand, value, flags) for value in values)
                elif op == "$options":
                    ok = True
                else:
                    raise NotImplementedError(op)
                if not ok:
                    return False
        elif not any(value == condition for value in values):
            return False
    return True


class SpyProducts:
    """Answers find/find_one from memory and records them. Any other method
    (insert/update/delete/replace/find_one_and_*/bulk_write/...) fails the test."""

    def __init__(self, docs):
        self.docs = copy.deepcopy(docs)
        self.calls = []

    def find(self, query=None, projection=None):
        self.calls.append("find")
        return [copy.deepcopy(doc) for doc in self.docs if _matches(doc, query or {})]

    def find_one(self, query=None, projection=None):
        self.calls.append("find_one")
        return next((copy.deepcopy(doc) for doc in self.docs if _matches(doc, query or {})), None)

    def __getattr__(self, name):
        raise AssertionError(f"receiving preview must not call products.{name}")


def _line(incoming, variant_id=None, color=None, size=None):
    return {"variantId": variant_id, "color": color, "size": size, "incomingStock": incoming}


class ReceivingPreviewTests(unittest.TestCase):
    def setUp(self):
        self.products = SpyProducts(PRODUCTS)
        for target in (inventory_receiving, product_duplicates):
            patcher = patch.object(target, "products", self.products)
            patcher.start()
            self.addCleanup(patcher.stop)

    def preview(self, tenant="store-a", **payload):
        result = inventory_receiving.build_receiving_preview(tenant, ReceivingPreviewRequest(**payload))
        ReceivingPreviewResponse.model_validate(result)  # response always fits the declared schema
        return result

    def assert_rejected(self, status, **payload):
        with self.assertRaises(HTTPException) as error:
            self.preview(**payload)
        self.assertEqual(error.exception.status_code, status)
        return error.exception.detail

    # A. explicit productId + existing variant: 20 + 10 = 30
    def test_explicit_product_existing_variant(self):
        result = self.preview(productId=str(NIKE_ID), variants=[_line(10, "NK-TS-BLK-S")])

        self.assertEqual(result["action"], "EXISTING_PRODUCT")
        self.assertEqual(result["matchType"], "explicit_product_id")
        self.assertFalse(result["requiresConfirmation"])
        self.assertEqual(result["product"]["id"], str(NIKE_ID))
        row = result["variants"][0]
        self.assertEqual((row["existingStock"], row["incomingStock"], row["finalStock"]), (20, 10, 30))
        self.assertEqual(row["action"], "ADD_TO_EXISTING_VARIANT")

    # B. existing product + new variant: 0 + 30 = 30
    def test_existing_product_new_variant(self):
        result = self.preview(productId=str(NIKE_ID), variants=[_line(30, color="Yellow", size="XL")])

        row = result["variants"][0]
        self.assertEqual((row["existingStock"], row["incomingStock"], row["finalStock"]), (0, 30, 30))
        self.assertEqual(row["action"], "CREATE_NEW_VARIANT")
        self.assertIsNone(row["variantId"])
        self.assertEqual(row["proposedVariantId"], "NI-TSHI-YEL-XL")
        self.assertEqual(row["matchedBy"], "new")

    # C. multiple variants calculate independently (the example from the spec)
    def test_multiple_variants_calculate_independently(self):
        result = self.preview(
            productId=str(NIKE_ID),
            variants=[
                _line(10, color="Black", size="S"),
                _line(20, color="Black", size="M"),
                _line(15, color="Yellow", size="M"),
                _line(30, color="Yellow", size="XL"),
            ],
        )

        self.assertEqual(
            [(row["variantId"], row["existingStock"], row["incomingStock"], row["finalStock"]) for row in result["variants"]],
            [
                ("NK-TS-BLK-S", 20, 10, 30),
                ("NK-TS-BLK-M", 100, 20, 120),
                ("NK-TS-YLW-M", 40, 15, 55),
                (None, 0, 30, 30),
            ],
        )
        self.assertEqual(result["totals"], {"existingStock": 160, "incomingStock": 75, "finalStock": 235})

    # D. incomingStock = 0 works
    def test_zero_incoming_keeps_existing_stock(self):
        row = self.preview(productId=str(NIKE_ID), variants=[_line(0, "NK-TS-BLK-M")])["variants"][0]
        self.assertEqual((row["existingStock"], row["incomingStock"], row["finalStock"]), (100, 0, 100))

    # E. negative / non-integer / oversized incomingStock rejected (422 at the API)
    def test_invalid_incoming_stock_is_rejected(self):
        for bad in (-1, 1.5, "10", True, None, 100_001):
            with self.subTest(incomingStock=bad), self.assertRaises(ValidationError):
                ReceivingVariantInput(color="Black", size="S", incomingStock=bad)
        with self.assertRaises(ValidationError):
            ReceivingVariantInput(color="Black", size="S")
        with self.assertRaises(ValidationError):  # unknown fields such as "stock" are not accepted
            ReceivingVariantInput(color="Black", size="S", incomingStock=1, stock=5)

    # F. cross-tenant product rejected
    def test_other_stores_product_is_not_found(self):
        detail = self.assert_rejected(404, productId=str(OTHER_STORE_ID), variants=[_line(1, "B-ONLY")])
        self.assertEqual(detail, "Product not found.")

    def test_other_stores_variant_id_is_not_found(self):
        self.assert_rejected(400, variants=[_line(1, "B-ONLY")])

    # G. nonexistent / malformed productId rejected
    def test_missing_or_malformed_product_id(self):
        self.assert_rejected(404, productId=str(ObjectId()), variants=[_line(1, color="Black", size="S")])
        self.assert_rejected(400, productId="not-an-id", variants=[_line(1, color="Black", size="S")])

    # H. exact variantId preserves the existing variantId
    def test_exact_variant_id_is_preserved(self):
        row = self.preview(
            productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-M", color=" black ", size="m")]
        )["variants"][0]

        self.assertEqual(row["variantId"], "NK-TS-BLK-M")
        self.assertEqual(row["matchedBy"], "variant_id")
        self.assertIsNone(row["proposedVariantId"])

    def test_variant_id_not_on_product_is_rejected(self):
        self.assert_rejected(400, productId=str(NIKE_ID), variants=[_line(5, "NK-TS-RED-S")])

    def test_variant_id_with_conflicting_color_or_size_is_rejected(self):
        self.assert_rejected(400, productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-M", color="Yellow", size="M")])

    # I. color + size finds the existing variant
    def test_color_and_size_find_existing_variant(self):
        row = self.preview(productId=str(NIKE_ID), variants=[_line(4, color="  BLACK ", size="s")])["variants"][0]

        self.assertEqual(row["variantId"], "NK-TS-BLK-S")
        self.assertEqual(row["matchedBy"], "color_size")
        self.assertEqual(row["finalStock"], 24)

    # J. name + category is only a candidate
    def test_name_and_category_match_is_a_candidate(self):
        result = self.preview(
            name="  NIKE t-shirt ", categoryId="t_shirts", variants=[_line(10, color="Black", size="S")]
        )

        self.assertEqual(result["action"], "EXISTING_PRODUCT")
        self.assertEqual(result["matchType"], "candidate")
        self.assertTrue(result["requiresConfirmation"])
        self.assertEqual(result["product"]["id"], str(NIKE_ID))
        self.assertEqual(result["variants"][0]["finalStock"], 30)
        # A candidate can never be committed; the admin must choose the product first.
        self.assertIsNone(result["previewToken"])
        self.assertIsNone(result["expiresAt"])

    def test_preview_returns_a_signed_token_with_the_previewed_amounts(self):
        result = self.preview(
            productId=str(NIKE_ID),
            variants=[_line(10, "NK-TS-BLK-S"), _line(30, color="Yellow", size="XL")],
        )

        claims = inventory_receiving.verify_preview_token(result["previewToken"])
        self.assertEqual(claims.tid, "store-a")
        self.assertEqual(claims.pid, str(NIKE_ID))
        self.assertEqual(
            [(line.a, line.v, line.e, line.i, line.p) for line in claims.lines],
            [
                ("ADD_TO_EXISTING_VARIANT", "NK-TS-BLK-S", 20, 10, None),
                ("CREATE_NEW_VARIANT", None, None, 30, "NI-TSHI-YEL-XL"),
            ],
        )
        self.assertIsNotNone(result["expiresAt"])

    # K. no match -> new product
    def test_no_match_is_a_new_product(self):
        result = self.preview(
            name="Linen Kurta", categoryId="T_SHIRTS", brand="Fab", variants=[_line(12, color="White", size="L")]
        )

        self.assertEqual(result["action"], "NEW_PRODUCT")
        self.assertEqual(result["matchType"], "none")
        self.assertFalse(result["requiresConfirmation"])
        self.assertIsNone(result["product"]["id"])
        self.assertEqual(result["category"]["status"], "existing")
        row = result["variants"][0]
        self.assertEqual((row["existingStock"], row["finalStock"], row["action"]), (0, 12, "CREATE_NEW_VARIANT"))
        self.assertEqual(row["proposedVariantId"], "FA-TSHI-WHI-L")

    def test_new_category_is_a_warning_that_requires_confirmation(self):
        result = self.preview(name="Linen Kurta", categoryId="KURTAS", variants=[_line(1, color="White", size="L")])

        self.assertEqual(result["category"], {"categoryId": "KURTAS", "categoryName": "Kurtas", "status": "new_to_store"})
        self.assertTrue(result["requiresConfirmation"])
        self.assertTrue(any("KURTAS" in warning for warning in result["warnings"]))

    def test_new_product_needs_name_and_category(self):
        self.assert_rejected(400, name="Linen Kurta", variants=[_line(1, color="White", size="L")])
        self.assert_rejected(400, categoryId="KURTAS", variants=[_line(1, color="White", size="L")])

    # variantId matching across products
    def test_unique_variant_id_identifies_the_product(self):
        result = self.preview(variants=[_line(2, "gold-blue-one-size")])

        self.assertEqual(result["matchType"], "variant_id")
        self.assertEqual(result["product"]["id"], str(LEGACY_ID))
        self.assertEqual((result["product"]["isActive"], result["product"]["isDraft"]), (False, True))
        self.assertEqual(result["variants"][0]["finalStock"], 5)

    def test_shared_variant_id_is_never_guessed(self):
        detail = self.assert_rejected(409, variants=[_line(1, "standard-one-size")])

        self.assertEqual(detail["code"], "AMBIGUOUS_VARIANT_ID")
        self.assertEqual(detail["variantIds"], ["standard-one-size"])
        self.assertEqual({row["id"] for row in detail["candidates"]}, {str(SHARED_A_ID), str(SHARED_B_ID)})

    def test_shared_variant_id_works_once_the_product_is_chosen(self):
        result = self.preview(productId=str(SHARED_B_ID), variants=[_line(4, "standard-one-size")])

        self.assertEqual(result["product"]["id"], str(SHARED_B_ID))
        self.assertEqual(result["variants"][0]["finalStock"], 5)

    def test_variant_ids_from_different_products_are_rejected(self):
        self.assert_rejected(400, variants=[_line(1, "NK-TS-BLK-S"), _line(1, "gold-blue-one-size")])

    # M. malformed / duplicate incoming lines rejected safely
    def test_duplicate_or_malformed_lines_are_rejected(self):
        self.assert_rejected(400, productId=str(NIKE_ID), variants=[_line(1, "NK-TS-BLK-S"), _line(2, "NK-TS-BLK-S")])
        self.assert_rejected(
            400, productId=str(NIKE_ID), variants=[_line(1, color="Black", size="S"), _line(2, color="black ", size=" S")]
        )
        self.assert_rejected(
            400, productId=str(NIKE_ID), variants=[_line(1, "NK-TS-BLK-S"), _line(2, color="Black", size="S")]
        )
        for payload in (
            {"variants": []},
            {"variants": [{"color": "Black", "incomingStock": 1}]},
            {"variants": [{"variantId": "  ", "incomingStock": 1}]},
            {"variants": [_line(1, "NK-TS-BLK-S")], "unknownField": 1},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                ReceivingPreviewRequest(**payload)

    def test_generated_variant_id_clash_is_warned(self):
        result = self.preview(productId=str(LIGHT_ID), variants=[_line(1, color="Light Pink", size="M")])

        self.assertEqual(result["variants"][0]["proposedVariantId"], "GEN-SHIR-LIG-M")
        self.assertTrue(any("GEN-SHIR-LIG-M" in warning for warning in result["warnings"]))

    def test_different_category_on_existing_product_is_warned_not_changed(self):
        result = self.preview(productId=str(NIKE_ID), categoryId="SHOES", variants=[_line(1, "NK-TS-BLK-S")])

        self.assertEqual(result["category"]["categoryId"], "T_SHIRTS")
        self.assertTrue(any("SHOES" in warning for warning in result["warnings"]))

    # L + N. zero writes, stored stock unchanged
    def test_preview_is_read_only(self):
        before = copy.deepcopy(self.products.docs)
        payloads = [
            {"productId": str(NIKE_ID), "variants": [_line(10, "NK-TS-BLK-S"), _line(30, color="Yellow", size="XL")]},
            {"name": "Nike T-Shirt", "categoryId": "T_SHIRTS", "variants": [_line(5, color="Black", size="M")]},
            {"name": "Linen Kurta", "categoryId": "KURTAS", "variants": [_line(1, color="White", size="L")]},
            {"variants": [_line(2, "gold-blue-one-size")]},
        ]
        for payload in payloads:
            self.preview(**payload)

        # SpyProducts fails on any non-read call; only reads were made.
        self.assertTrue(self.products.calls)
        self.assertLessEqual(set(self.products.calls), {"find", "find_one"})
        self.assertEqual(self.products.docs, before)
        nike = next(doc for doc in self.products.docs if doc["_id"] == NIKE_ID)
        self.assertEqual([item["stock"] for item in nike["inventory"]], [20, 100, 40])
        self.assertEqual((nike["stock"], nike["totalStock"]), (160, 160))


class ReceivingPreviewRouteTests(unittest.TestCase):
    def setUp(self):
        self.products = SpyProducts(PRODUCTS)
        for target in (inventory_receiving, product_duplicates):
            patcher = patch.object(target, "products", self.products)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_admin_preview_uses_token_tenant(self):
        payload = ReceivingPreviewRequest(productId=str(NIKE_ID), variants=[_line(10, "NK-TS-BLK-S")])

        result = inventory_routes.preview_receiving(payload, {"role": "admin", "tenantId": "store-a"})

        self.assertEqual(result["variants"][0]["finalStock"], 30)

    def test_admin_cannot_preview_another_store(self):
        payload = ReceivingPreviewRequest(tenantId="store-b", productId=str(OTHER_STORE_ID), variants=[_line(1, "B-ONLY")])

        with self.assertRaises(HTTPException) as error:
            inventory_routes.preview_receiving(payload, {"role": "admin", "tenantId": "store-a"})
        self.assertEqual(error.exception.status_code, 403)

    def test_endpoint_requires_inventory_permission(self):
        annotation = inspect.signature(inventory_routes.preview_receiving).parameters["current_user"].annotation
        permission_check = annotation.__metadata__[0].dependency

        manager = {"role": "store_manager", "tenantId": "store-a", "permissions": {"read": True, "inventory": False}}
        with self.assertRaises(HTTPException) as error:
            permission_check(manager)
        self.assertEqual(error.exception.status_code, 403)

        manager["permissions"]["inventory"] = True
        self.assertIs(permission_check(manager), manager)


if __name__ == "__main__":
    unittest.main()
