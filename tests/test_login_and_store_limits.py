import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.routes import auth as auth_routes
from app.services import rate_limit, store_rate_limit
from app.utils.jwt_handler import create_token
from app.utils.order_ref import format_order_ref, order_ref


class _Counters:
    """In-memory stand-in for the rate_limits collection."""

    def __init__(self):
        self.docs = {}

    def find_one_and_update(self, query, update, upsert, return_document):
        doc = self.docs.setdefault(query["_id"], {"count": 0})
        doc["count"] += update["$inc"]["count"]
        return dict(doc)

    def find_one(self, query, projection=None):
        return self.docs.get(query["_id"])


class LoginCountsOnlyFailuresTests(unittest.TestCase):
    def _login(self, authenticate_result):
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.1"
        user = MagicMock(email="owner@example.com", tenantId="store-1")
        with patch.object(auth_routes, "_authenticate", side_effect=[authenticate_result]):
            return auth_routes.login(user, request)

    def test_successful_logins_never_lock_an_account(self):
        counters = _Counters()
        with patch.object(rate_limit, "rate_limits", counters):
            for _ in range(25):
                self.assertEqual(self._login({"success": True}), {"success": True})

    def test_ten_failures_block_the_eleventh_attempt_even_with_right_password(self):
        counters = _Counters()
        with patch.object(rate_limit, "rate_limits", counters):
            for _ in range(10):
                with self.assertRaises(HTTPException) as context:
                    self._login(HTTPException(status_code=401, detail="Invalid credentials."))
                self.assertEqual(context.exception.status_code, 401)
            with self.assertRaises(HTTPException) as context:
                self._login({"success": True})
        self.assertEqual(context.exception.status_code, 429)

    def test_non_auth_errors_do_not_count_as_failures(self):
        counters = _Counters()
        with patch.object(rate_limit, "rate_limits", counters):
            for _ in range(15):
                with self.assertRaises(HTTPException):
                    self._login(HTTPException(status_code=404, detail="x"))
            self.assertEqual(self._login({"success": True}), {"success": True})


class StoreRateLimiterTests(unittest.TestCase):
    def test_blocks_a_store_past_its_limit_without_affecting_others(self):
        limiter = store_rate_limit.StoreRateLimiter(3, window_seconds=60)
        now = 1_000_020.0
        self.assertTrue(all(limiter.allow("tenant:busy", now)[0] for _ in range(3)))
        allowed, retry_after = limiter.allow("tenant:busy", now)
        self.assertFalse(allowed)
        self.assertGreater(retry_after, 0)
        self.assertTrue(limiter.allow("tenant:quiet", now)[0])

    def test_new_window_resets_the_count(self):
        limiter = store_rate_limit.StoreRateLimiter(1, window_seconds=60)
        self.assertTrue(limiter.allow("tenant:a", 120.0)[0])
        self.assertFalse(limiter.allow("tenant:a", 150.0)[0])
        self.assertTrue(limiter.allow("tenant:a", 181.0)[0])

    def _request(self, path="/product/get-all-products", query=None, token=None):
        request = MagicMock()
        request.url.path = path
        request.query_params = query or {}
        request.headers = {"authorization": f"Bearer {token}"} if token else {}
        return request

    def test_store_is_found_from_query_path_or_verified_token(self):
        self.assertEqual(store_rate_limit.store_key_for(self._request(query={"tenantId": "Store-1"})), "tenant:store-1")
        self.assertEqual(store_rate_limit.store_key_for(self._request(path="/tenants/slug/shop-x")), "slug:shop-x")
        token = create_token({"userId": "u", "tenantId": "store-2", "role": "customer"})
        self.assertEqual(store_rate_limit.store_key_for(self._request(token=token)), "tenant:store-2")

    def test_forged_token_is_not_trusted(self):
        forged = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6InZpY3RpbSJ9.bad-signature"
        self.assertIsNone(store_rate_limit.store_key_for(self._request(token=forged)))

    def test_super_admin_and_webhooks_are_never_limited(self):
        token = create_token({"userId": "u", "tenantId": None, "role": "super_admin"})
        self.assertIsNone(store_rate_limit.store_key_for(self._request(query={"tenantId": "x"}, token=token)))
        self.assertIsNone(store_rate_limit.store_key_for(self._request(path="/payments/webhook", query={"tenantId": "x"})))


class OrderRefTests(unittest.TestCase):
    def test_formats_as_rc_number(self):
        self.assertEqual(format_order_ref(1), "RC-10001")
        self.assertEqual(format_order_ref(25), "RC-10025")

    def test_rejects_non_positive_and_non_int(self):
        for bad in (None, 0, -3, "5", True):
            self.assertIsNone(format_order_ref(bad))

    def test_old_orders_fall_back_to_id_suffix(self):
        self.assertEqual(order_ref({"_id": "abcdef0123456789"}), "23456789")


if __name__ == "__main__":
    unittest.main()
