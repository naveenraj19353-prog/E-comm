"""Per-customer coupon usage limit (REQ-084)."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.models.coupon import CreateCoupon, UpdateCoupon
from app.services import coupon_service
from app.services.coupon_service import apply_coupon_discount, build_coupon_document


class PerCustomerLimitTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.coupon = {
            "code": "WELCOME",
            "discountType": "fixed",
            "discountValue": 50,
            "minimumOrderAmount": 0,
            "usageLimit": 0,
            "usedCount": 0,
            "isActive": True,
            "startDate": now - timedelta(days=1),
            "endDate": now + timedelta(days=5),
            "offerType": "general",
            "perCustomerLimit": 1,
        }
        load = patch.object(coupon_service, "load_valid_coupon", side_effect=lambda *_: dict(self.coupon))
        load.start()
        self.addCleanup(load.stop)

    def apply(self, uses, user_id="u1"):
        with patch.object(coupon_service, "_customer_coupon_uses", return_value=uses) as counter:
            result = apply_coupon_discount("store-a", "welcome", 500, user_id=user_id, items=[])
        return result, counter

    def test_first_use_is_allowed(self):
        (discount, code), counter = self.apply(uses=0)
        self.assertEqual((discount, code), (50, "WELCOME"))
        counter.assert_called_once_with("store-a", "u1", "WELCOME")

    def test_customer_at_the_limit_is_refused(self):
        with self.assertRaises(HTTPException) as error:
            self.apply(uses=1)
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.detail, "You have already used this coupon.")

    def test_higher_limit_allows_more_uses(self):
        self.coupon["perCustomerLimit"] = 3
        self.assertEqual(self.apply(uses=2)[0][0], 50)
        with self.assertRaises(HTTPException) as error:
            self.apply(uses=3)
        self.assertIn("3 times", error.exception.detail)

    def test_zero_means_no_per_customer_limit(self):
        self.coupon["perCustomerLimit"] = 0
        (discount, _), counter = self.apply(uses=99)
        self.assertEqual(discount, 50)
        counter.assert_not_called()

    def test_login_is_required_when_limited(self):
        with self.assertRaises(HTTPException) as error:
            self.apply(uses=0, user_id=None)
        self.assertIn("Login is required", error.exception.detail)

    def test_uses_count_only_this_customers_non_cancelled_orders(self):
        with patch.object(coupon_service, "orders") as orders, patch.object(
            coupon_service, "cart_owner_query", return_value={"tenantId": "store-a", "userId": "u1"}
        ):
            orders.count_documents.return_value = 2
            self.assertEqual(coupon_service._customer_coupon_uses("store-a", "u1", "WELCOME"), 2)
        query = orders.count_documents.call_args.args[0]
        self.assertEqual(
            query,
            {"tenantId": "store-a", "userId": "u1", "couponCode": "WELCOME", "orderStatus": {"$nin": ["cancelled"]}},
        )


class PerCustomerLimitStorageTests(unittest.TestCase):
    def test_limit_is_validated_and_stored(self):
        now = datetime.now(timezone.utc)
        payload = CreateCoupon(
            tenantId="store-a",
            code="welcome",
            discountType="fixed",
            discountValue=50,
            perCustomerLimit=2,
            startDate=now,
            endDate=now + timedelta(days=1),
        ).model_dump()
        self.assertEqual(build_coupon_document("store-a", payload)["perCustomerLimit"], 2)
        self.assertEqual(build_coupon_document("store-a", {**payload, "perCustomerLimit": None})["perCustomerLimit"], 0)

        for bad in (-1, 1001):
            with self.subTest(value=bad), self.assertRaises(ValidationError):
                UpdateCoupon(perCustomerLimit=bad)


if __name__ == "__main__":
    unittest.main()
