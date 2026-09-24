import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.services import rate_limit


class ClientIpTests(unittest.TestCase):
    def test_uses_socket_address_when_no_proxies_trusted(self):
        request = MagicMock()
        request.headers = {"x-forwarded-for": "1.1.1.1, 2.2.2.2"}
        request.client.host = "10.0.0.5"
        with patch.object(rate_limit, "TRUSTED_PROXY_HOPS", 0):
            self.assertEqual(rate_limit.client_ip(request), "10.0.0.5")

    def test_reads_client_ip_from_forwarded_for_with_one_trusted_proxy(self):
        # A single trusted proxy appends the address of whoever connected to
        # it directly, after any values a client tried to spoof — so the real
        # client is the last entry, not the first.
        request = MagicMock()
        request.headers = {"x-forwarded-for": "1.2.3.4, 203.0.113.9"}
        request.client.host = "10.0.0.1"
        with patch.object(rate_limit, "TRUSTED_PROXY_HOPS", 1):
            self.assertEqual(rate_limit.client_ip(request), "203.0.113.9")

    def test_falls_back_to_socket_address_when_header_missing(self):
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.5"
        with patch.object(rate_limit, "TRUSTED_PROXY_HOPS", 1):
            self.assertEqual(rate_limit.client_ip(request), "10.0.0.5")


class FakeRateLimits:
    def __init__(self):
        self.counts = {}

    def find_one_and_update(self, query, update, upsert, return_document):
        key = query["_id"]
        self.counts[key] = self.counts.get(key, 0) + 1
        return {"count": self.counts[key]}


class HitTests(unittest.TestCase):
    def test_allows_up_to_the_limit(self):
        fake = FakeRateLimits()
        with patch.object(rate_limit, "rate_limits", fake):
            for _ in range(5):
                rate_limit.hit("scope", "same-key", limit=5, window_seconds=60)

    def test_blocks_once_limit_is_exceeded(self):
        fake = FakeRateLimits()
        with patch.object(rate_limit, "rate_limits", fake):
            for _ in range(5):
                rate_limit.hit("scope", "same-key", limit=5, window_seconds=60)
            with self.assertRaises(HTTPException) as context:
                rate_limit.hit("scope", "same-key", limit=5, window_seconds=60)
        self.assertEqual(context.exception.status_code, 429)

    def test_different_keys_are_independent(self):
        fake = FakeRateLimits()
        with patch.object(rate_limit, "rate_limits", fake):
            for _ in range(5):
                rate_limit.hit("scope", "key-a", limit=5, window_seconds=60)
            # key-b has its own budget even though key-a is exhausted.
            rate_limit.hit("scope", "key-b", limit=5, window_seconds=60)


if __name__ == "__main__":
    unittest.main()
