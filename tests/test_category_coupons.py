"""Category-targeted coupons (REQ-085)."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException

from app.services import coupon_service
from app.services.checkout_service import _build_checkout_item
from app.services.coupon_service import apply_coupon_discount, build_coupon_document

ITEMS = [
    {"productId": "p1", "categoryId": "SAREES", "subtotal": 1200.0},
    {"productId": "p2", "categoryId": "SAREES", "subtotal": 800.0},
    {"productId": "p3", "categoryId": "BLOUSES", "subtotal": 500.0},
]


class CategoryCouponDiscountTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.coupon = {
            "code": "SAREE10",
            "discountType": "percentage",
            "discountValue": 10,
            "maximumDiscount": 0,
            "minimumOrderAmount": 0,
            "usageLimit": 0,
            "usedCount": 0,
            "isActive": True,
            "startDate": now - timedelta(days=1),
            "endDate": now + timedelta(days=1),
            "offerType": "category",
            "categoryId": "SAREES",
        }
        loader = patch.object(coupon_service, "load_valid_coupon", side_effect=lambda *_: dict(self.coupon))
        loader.start()
        self.addCleanup(loader.stop)

    def test_discount_only_counts_lines_from_the_category(self):
        discount, code = apply_coupon_discount("shop", "saree10", 2500, user_id="u1", items=ITEMS)
        self.assertEqual((discount, code), (200.0, "SAREE10"))  # 10% of 1200 + 800, not of 2500

    def test_minimum_order_applies_to_the_category_amount(self):
        self.coupon["minimumOrderAmount"] = 2100
        with self.assertRaises(HTTPException) as error:
            apply_coupon_discount("shop", "saree10", 2500, user_id="u1", items=ITEMS)
        self.assertIn("Minimum order amount", error.exception.detail)

    def test_cart_without_the_category_is_refused(self):
        with self.assertRaises(HTTPException) as error:
            apply_coupon_discount("shop", "saree10", 500, user_id="u1", items=[ITEMS[2]])
        self.assertIn("offer category", error.exception.detail)

    def test_misconfigured_category_coupon_is_refused(self):
        self.coupon["categoryId"] = None
        with self.assertRaises(HTTPException):
            apply_coupon_discount("shop", "saree10", 2500, user_id="u1", items=ITEMS)


class CategoryCouponStorageTests(unittest.TestCase):
    def payload(self, **extra):
        now = datetime.now(timezone.utc)
        return {
            "code": "saree10",
            "discountType": "percentage",
            "discountValue": 10,
            "startDate": now,
            "endDate": now + timedelta(days=1),
            "offerType": "category",
            "categoryId": "SAREES",
            **extra,
        }

    def test_existing_category_is_stored(self):
        with patch.object(coupon_service, "products") as products:
            products.find_one.return_value = {"_id": "p1"}
            document = build_coupon_document("shop", self.payload())
        self.assertEqual(document["categoryId"], "SAREES")
        self.assertEqual(document["offerType"], "category")

    def test_category_must_exist_and_is_never_created(self):
        with patch.object(coupon_service, "products") as products:
            products.find_one.return_value = None
            with self.assertRaises(HTTPException) as error:
                build_coupon_document("shop", self.payload(categoryId="NEW_CATEGORY"))
        self.assertIn("not found", error.exception.detail)
        with self.assertRaises(HTTPException):
            build_coupon_document("shop", self.payload(categoryId=""))

    def test_other_coupon_types_drop_the_category(self):
        document = build_coupon_document("shop", self.payload(offerType="general"))
        self.assertIsNone(document["categoryId"])


class CheckoutLineCategoryTests(unittest.TestCase):
    def test_checkout_lines_carry_the_product_category(self):
        product = {"_id": "p1", "name": "Silk Saree", "finalPrice": 600.0, "categoryId": "SAREES", "images": {}}
        line = _build_checkout_item(product, {"variantId": "v1", "color": "Red", "size": "Free"}, 2)
        self.assertEqual(line["categoryId"], "SAREES")
        self.assertEqual(line["subtotal"], 1200.0)


if __name__ == "__main__":
    unittest.main()
