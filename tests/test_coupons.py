import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException

from app.services.coupon_service import apply_coupon_discount, calculate_discount


class CouponServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.coupon = {
            "code": "SAVE10",
            "discountType": "percentage",
            "discountValue": 10,
            "maximumDiscount": 50,
            "minimumOrderAmount": 0,
            "usageLimit": 0,
            "usedCount": 0,
            "isActive": True,
            "startDate": self.now - timedelta(days=1),
            "endDate": self.now + timedelta(days=5),
            "offerType": "general",
        }

    def test_percentage_discount_caps_at_maximum(self):
        self.assertEqual(calculate_discount(self.coupon, 1000), 50)

    @patch("app.services.coupon_service.load_valid_coupon")
    def test_first_order_coupon_rejects_repeat_customer(self, load):
        load.return_value = {**self.coupon, "offerType": "first_order", "code": "FIRST"}
        with patch(
            "app.services.coupon_service._customer_has_prior_order",
            return_value=True,
        ):
            with self.assertRaises(HTTPException) as error:
                apply_coupon_discount("vedic-paan", "FIRST", 200, user_id="u1", items=[])
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("first order", error.exception.detail)

    @patch("app.services.coupon_service.load_valid_coupon")
    def test_product_coupon_uses_matching_line_only(self, load):
        load.return_value = {
            **self.coupon,
            "offerType": "product",
            "productId": "p1",
            "maximumDiscount": 0,
            "code": "PAAN",
        }
        discount, code = apply_coupon_discount(
            "vedic-paan",
            "PAAN",
            500,
            user_id="u1",
            items=[
                {"productId": "p1", "subtotal": 100},
                {"productId": "p2", "subtotal": 400},
            ],
        )
        self.assertEqual(code, "PAAN")
        self.assertEqual(discount, 10)

    @patch("app.services.coupon_service.load_valid_coupon")
    def test_product_coupon_requires_product_in_cart(self, load):
        load.return_value = {
            **self.coupon,
            "offerType": "product",
            "productId": "p1",
            "code": "PAAN",
        }
        with self.assertRaises(HTTPException) as error:
            apply_coupon_discount(
                "vedic-paan",
                "PAAN",
                400,
                user_id="u1",
                items=[{"productId": "p2", "subtotal": 400}],
            )
        self.assertIn("offer product", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
