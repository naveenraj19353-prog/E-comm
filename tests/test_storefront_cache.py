"""Storefront caching, CDN/presigned image URLs and customer list pagination.

No database or S3 access: collections and the S3 client are replaced by fakes.
"""

import threading
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId

from app.routes import product as product_routes
from app.routes import users as users_routes
from app.services import cache as cache_module
from app.services import home_service, s3_service, storefront_layout
from app.services.cache import TTLCache
from app.utils import product_serialize

KEY_A = "tenants/store-a/products/11111111-1111-1111-1111-111111111111.jpg"
KEY_B = "tenants/store-b/products/22222222-2222-2222-2222-222222222222.png"


class FakeClock:
    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


# ---------------------------------------------------------------------------
# TTL cache
# ---------------------------------------------------------------------------


class TTLCacheTests(unittest.TestCase):
    def test_entry_expires_after_ttl(self):
        clock = FakeClock()
        cache = TTLCache(clock=clock)
        cache.set(("t1", "home"), {"a": 1}, ttl=60)
        self.assertEqual(cache.get(("t1", "home")), {"a": 1})
        clock.now += 59
        self.assertEqual(cache.get(("t1", "home")), {"a": 1})
        clock.now += 1
        self.assertIsNone(cache.get(("t1", "home")))
        self.assertEqual(len(cache), 0)

    def test_zero_ttl_disables_caching(self):
        cache = TTLCache()
        calls = []
        for _ in range(3):
            cache.get_or_set(("t1", "x"), lambda: calls.append(1) or len(calls), ttl=0)
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(cache), 0)

    def test_get_or_set_builds_once_until_expiry(self):
        clock = FakeClock()
        cache = TTLCache(clock=clock)
        calls = []

        def build():
            calls.append(1)
            return len(calls)

        self.assertEqual(cache.get_or_set(("t1", "k"), build, ttl=10), 1)
        self.assertEqual(cache.get_or_set(("t1", "k"), build, ttl=10), 1)
        clock.now += 11
        self.assertEqual(cache.get_or_set(("t1", "k"), build, ttl=10), 2)

    def test_falsy_values_are_cached(self):
        cache = TTLCache()
        calls = []
        for _ in range(2):
            cache.get_or_set(("t1", "empty"), lambda: calls.append(1) or [], ttl=10)
        self.assertEqual(len(calls), 1)

    def test_builder_errors_are_not_cached(self):
        cache = TTLCache()

        def boom():
            raise RuntimeError("db down")

        with self.assertRaises(RuntimeError):
            cache.get_or_set(("t1", "k"), boom, ttl=10)
        self.assertEqual(cache.get_or_set(("t1", "k"), lambda: "ok", ttl=10), "ok")

    def test_bounded_size_evicts_least_recently_used(self):
        cache = TTLCache(max_entries=2)
        cache.set(("t", 1), "one", ttl=60)
        cache.set(("t", 2), "two", ttl=60)
        cache.get(("t", 1))  # 1 is now most recently used
        cache.set(("t", 3), "three", ttl=60)
        self.assertEqual(len(cache), 2)
        self.assertEqual(cache.get(("t", 1)), "one")
        self.assertIsNone(cache.get(("t", 2)))
        self.assertEqual(cache.get(("t", 3)), "three")

    def test_invalidate_prefix_is_isolated_per_tenant(self):
        cache = TTLCache()
        cache.set(("store-a", "home", 10, 12), "a-home", ttl=60)
        cache.set(("store-a", "products", 1), "a-products", ttl=60)
        cache.set(("store-b", "home", 10, 12), "b-home", ttl=60)
        # Look-alike ids must not match by string prefix.
        cache.set(("store-a:x", "home"), "lookalike", ttl=60)
        cache.set(("store-ab", "home"), "lookalike-2", ttl=60)

        removed = cache.invalidate_prefix(("store-a",))

        self.assertEqual(removed, 2)
        self.assertIsNone(cache.get(("store-a", "home", 10, 12)))
        self.assertIsNone(cache.get(("store-a", "products", 1)))
        self.assertEqual(cache.get(("store-b", "home", 10, 12)), "b-home")
        self.assertEqual(cache.get(("store-a:x", "home")), "lookalike")
        self.assertEqual(cache.get(("store-ab", "home")), "lookalike-2")

    def test_value_built_during_invalidation_is_not_stored(self):
        cache = TTLCache()

        def build():
            # A write for this tenant lands while the (old) value is built.
            cache.invalidate_prefix(("store-a",))
            return "stale"

        self.assertEqual(cache.get_or_set(("store-a", "home"), build, ttl=60), "stale")
        self.assertIsNone(cache.get(("store-a", "home")))
        # Other tenants' builds are unaffected by that invalidation.
        cache.get_or_set(("store-b", "home"), lambda: "fresh", ttl=60)
        self.assertEqual(cache.get(("store-b", "home")), "fresh")

    def test_thread_safety_smoke(self):
        cache = TTLCache(max_entries=50)
        errors = []

        def worker(n):
            try:
                for i in range(500):
                    tenant = f"t{i % 5}"
                    cache.set((tenant, n, i), i, ttl=60)
                    cache.get((tenant, n, i))
                    if i % 50 == 0:
                        cache.invalidate_prefix((tenant,))
            except Exception as error:  # pragma: no cover - failure path
                errors.append(error)

        threads = [threading.Thread(target=worker, args=(n,)) for n in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertLessEqual(len(cache), 50)


class StorefrontTtlTests(unittest.TestCase):
    def test_ttl_disabled_when_zero(self):
        with patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 0):
            self.assertEqual(cache_module.storefront_ttl(), 0)

    def test_presigned_mode_caps_ttl_below_url_lifetime(self):
        with patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 600), \
                patch.object(s3_service, "CDN_BASE_URL", ""), \
                patch.object(s3_service, "S3_PRESIGNED_URL_EXPIRES", 400):
            # URLs are handed out with >= 200s left; payloads live <= 100s.
            self.assertEqual(cache_module.storefront_ttl(), 100)

    def test_presigned_mode_keeps_short_ttl(self):
        with patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 60), \
                patch.object(s3_service, "CDN_BASE_URL", ""), \
                patch.object(s3_service, "S3_PRESIGNED_URL_EXPIRES", 3600):
            self.assertEqual(cache_module.storefront_ttl(), 60)

    def test_cdn_mode_does_not_cap_ttl(self):
        with patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 900), \
                patch.object(s3_service, "CDN_BASE_URL", "https://cdn.example.com"), \
                patch.object(s3_service, "S3_PRESIGNED_URL_EXPIRES", 60):
            self.assertEqual(cache_module.storefront_ttl(), 900)


# ---------------------------------------------------------------------------
# Image URLs
# ---------------------------------------------------------------------------


class FakeS3Client:
    def __init__(self):
        self.calls = 0

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        self.calls += 1
        return (
            f"https://bucket.s3.amazonaws.com/{Params['Key']}"
            f"?X-Amz-Expires={ExpiresIn}&sig={self.calls}"
        )


class ImageUrlTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeS3Client()
        self.now = 1_000_000.0
        s3_service._presigned_cache.clear()
        patches = [
            patch.object(s3_service, "_s3_client", lambda: self.client),
            patch.object(s3_service.time, "time", lambda: self.now),
            patch.object(s3_service, "S3_PRESIGNED_URL_EXPIRES", 3600),
            patch.object(s3_service, "CDN_BASE_URL", ""),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(s3_service._presigned_cache.clear)

    def test_cdn_mode_returns_stable_cdn_url_without_signing(self):
        with patch.object(s3_service, "CDN_BASE_URL", "https://cdn.example.com"):
            first = s3_service.public_image_url(KEY_A)
            second = s3_service.public_image_url(KEY_A)
        self.assertEqual(first, f"https://cdn.example.com/{KEY_A}")
        self.assertEqual(first, second)
        self.assertEqual(self.client.calls, 0)

    def test_cdn_mode_only_rewrites_valid_tenant_keys(self):
        with patch.object(s3_service, "CDN_BASE_URL", "https://cdn.example.com"):
            url = s3_service.public_image_url("tenants/../secrets/x.jpg")
        self.assertFalse(url.startswith("https://cdn.example.com"))

    def test_presigned_mode_without_cdn(self):
        url = s3_service.public_image_url(KEY_A)
        self.assertIn("X-Amz-Expires=3600", url)
        self.assertEqual(self.client.calls, 1)

    def test_presigned_url_is_reused_for_same_key(self):
        first = s3_service.public_image_url(KEY_A)
        self.now += 1200
        second = s3_service.public_image_url(KEY_A)
        self.assertEqual(first, second)
        self.assertEqual(self.client.calls, 1)
        # A different key gets its own signature.
        other = s3_service.public_image_url(KEY_B)
        self.assertNotEqual(first, other)
        self.assertEqual(self.client.calls, 2)

    def test_presigned_url_is_renewed_before_it_expires(self):
        first = s3_service.public_image_url(KEY_A)
        # Past half the lifetime: never hand out a URL with < 1800s left.
        self.now += 1801
        second = s3_service.public_image_url(KEY_A)
        self.assertNotEqual(first, second)
        self.assertEqual(self.client.calls, 2)
        self.now += 60
        self.assertEqual(s3_service.public_image_url(KEY_A), second)

    def test_url_limited_by_short_lived_credentials_is_not_reused(self):
        credentials_expire = self.now + 600  # IAM role session ends in 10 min
        with patch.object(s3_service, "_credential_expiry", lambda client: credentials_expire):
            first = s3_service.public_image_url(KEY_A)
            second = s3_service.public_image_url(KEY_A)
        self.assertNotEqual(first, second)
        self.assertEqual(self.client.calls, 2)

    def test_explicit_expiration_is_never_cached(self):
        s3_service.generate_presigned_url(KEY_A, expiration=60)
        s3_service.generate_presigned_url(KEY_A, expiration=60)
        self.assertEqual(self.client.calls, 2)

    def test_deleting_image_forgets_cached_url(self):
        s3_service.public_image_url(KEY_A)
        s3_service._forget_presigned_url(KEY_A)
        s3_service.public_image_url(KEY_A)
        self.assertEqual(self.client.calls, 2)

    def test_serialized_product_uses_cdn_urls_and_keeps_legacy_urls(self):
        product = {
            "_id": ObjectId(),
            "images": {
                "Red": [KEY_A, "https://images.example.com/legacy.jpg"],
            },
            "inventory": [],
        }
        with patch.object(s3_service, "CDN_BASE_URL", "https://cdn.example.com"):
            data = product_serialize.serialize_product(product)
        self.assertEqual(
            data["images"]["Red"],
            [f"https://cdn.example.com/{KEY_A}", "https://images.example.com/legacy.jpg"],
        )

    def test_tenant_key_validation_unchanged(self):
        self.assertEqual(
            s3_service.validate_tenant_image_key(KEY_A, "store-a", "products"), KEY_A
        )
        with self.assertRaises(ValueError):
            s3_service.validate_tenant_image_key(KEY_A, "store-b", "products")
        with self.assertRaises(ValueError):
            s3_service.validate_tenant_image_key(KEY_A, "store-a", "banners")


# ---------------------------------------------------------------------------
# Cached storefront payloads
# ---------------------------------------------------------------------------


class CachedPayloadTestCase(unittest.TestCase):
    def setUp(self):
        cache_module.storefront_cache.clear()
        self.addCleanup(cache_module.storefront_cache.clear)
        for item in (
            patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 60),
            patch.object(s3_service, "CDN_BASE_URL", "https://cdn.example.com"),
        ):
            item.start()
            self.addCleanup(item.stop)


class HomeAndLayoutCacheTests(CachedPayloadTestCase):
    def test_home_data_cached_per_tenant_and_limits(self):
        calls = []

        def fake_build(tenant_id, product_limit, category_limit):
            calls.append((tenant_id, product_limit, category_limit))
            return {"tenant": tenant_id}

        with patch.object(home_service, "_build_home_data", fake_build):
            self.assertEqual(home_service.get_home_data("store-a")["tenant"], "store-a")
            home_service.get_home_data("store-a")
            self.assertEqual(home_service.get_home_data("store-b")["tenant"], "store-b")
            home_service.get_home_data("store-a", product_limit=20)
            self.assertEqual(len(calls), 3)

            cache_module.invalidate_tenant("store-a")
            home_service.get_home_data("store-a")
            home_service.get_home_data("store-b")
        self.assertEqual(len(calls), 4)

    def test_layout_cached_and_versioned_by_updated_at(self):
        tenant = {
            "tenantId": "store-a",
            "name": "Store A",
            "theme": "blue",
            "updatedAt": datetime(2026, 1, 1, tzinfo=timezone.utc),
        }
        with patch.object(
            storefront_layout,
            "_build_storefront_layout",
            wraps=storefront_layout._build_storefront_layout,
        ) as build:
            first = storefront_layout.build_storefront_layout(tenant)
            second = storefront_layout.build_storefront_layout(dict(tenant))
            self.assertEqual(build.call_count, 1)
            self.assertEqual(first, second)
            # Callers get their own copy.
            second["layoutSettings"]["productGridColumns"] = 99
            self.assertNotEqual(
                storefront_layout.build_storefront_layout(tenant)["layoutSettings"][
                    "productGridColumns"
                ],
                99,
            )
            # Saved on another process: newer updatedAt, new layout at once.
            changed = {
                **tenant,
                "theme": "dark",
                "updatedAt": datetime(2026, 1, 2, tzinfo=timezone.utc),
            }
            self.assertEqual(storefront_layout.build_storefront_layout(changed)["theme"], "dark")
            self.assertEqual(build.call_count, 2)


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)
        self.sort_args = None
        self.skip_value = 0
        self.limit_value = 0

    def sort(self, *args):
        self.sort_args = args
        return self

    def skip(self, value):
        self.skip_value = value
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def __iter__(self):
        docs = self.docs[self.skip_value:]
        if self.limit_value:
            docs = docs[: self.limit_value]
        return iter(docs)


class FakeProducts:
    def __init__(self, docs):
        self.docs = docs
        self.find_calls = []
        self.aggregate_calls = 0

    def _matches(self, query):
        return [
            doc
            for doc in self.docs
            if doc["tenantId"] == query["tenantId"]
            and (query.get("isActive") is None or doc["isActive"] == query["isActive"])
        ]

    def count_documents(self, query):
        return len(self._matches(query))

    def find(self, query, *args):
        self.find_calls.append(query)
        return FakeCursor(self._matches(query))

    def aggregate(self, pipeline):
        self.aggregate_calls += 1
        return iter([])


def _product(tenant_id, name, active=True):
    return {
        "_id": ObjectId(),
        "tenantId": tenant_id,
        "name": name,
        "isActive": active,
        "images": {"Default": [f"tenants/{tenant_id}/products/{ObjectId()}.jpg"]},
        "inventory": [],
    }


NO_FILTERS = {
    "categoryIds": None,
    "minPrice": None,
    "maxPrice": None,
    "sizes": None,
    "colors": None,
    "brands": None,
    "foodTypes": None,
    "rating": None,
    "search": None,
}


def _listing(current_user=None, include_inactive=False, page=1):
    return {
        "page": page,
        "limit": 12,
        "sortBy": "createdAt",
        "sortOrder": "desc",
        "includeInactive": include_inactive,
        "current_user": current_user,
    }


class ProductListingCacheTests(CachedPayloadTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeProducts(
            [
                _product("store-a", "Visible"),
                _product("store-a", "Hidden draft", active=False),
                _product("store-b", "Other store"),
            ]
        )
        item = patch.object(product_routes, "products", self.fake)
        item.start()
        self.addCleanup(item.stop)

    def _names(self, response):
        return [item["name"] for item in response["data"]]

    def test_public_listing_is_cached_per_tenant(self):
        first = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        second = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        self.assertEqual(self._names(first), ["Visible"])
        self.assertIs(first, second)
        self.assertEqual(len(self.fake.find_calls), 1)
        # Filters facet computed once too.
        self.assertEqual(self.fake.aggregate_calls, 1)

        other = product_routes.get_all_products("store-b", dict(NO_FILTERS), _listing())
        self.assertEqual(self._names(other), ["Other store"])
        page_two = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing(page=2))
        self.assertEqual(page_two["page"], 2)
        self.assertEqual(len(self.fake.find_calls), 3)

    def test_images_in_cached_listing_are_cdn_urls(self):
        response = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        url = response["data"][0]["images"]["Default"][0]
        self.assertTrue(url.startswith("https://cdn.example.com/tenants/store-a/products/"))

    def test_admin_listing_with_inactive_products_is_never_cached(self):
        admin = {"role": "admin", "tenantId": "store-a"}
        admin_view = product_routes.get_all_products(
            "store-a", dict(NO_FILTERS), _listing(admin, include_inactive=True)
        )
        self.assertEqual(sorted(self._names(admin_view)), ["Hidden draft", "Visible"])

        # A shopper right after the admin must not get the admin payload.
        public = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        self.assertEqual(self._names(public), ["Visible"])
        admin_again = product_routes.get_all_products(
            "store-a", dict(NO_FILTERS), _listing(admin, include_inactive=True)
        )
        self.assertEqual(sorted(self._names(admin_again)), ["Hidden draft", "Visible"])
        self.assertEqual(len(self.fake.find_calls), 3)

    def test_customer_asking_for_inactive_gets_cached_public_view(self):
        customer = {"role": "customer", "tenantId": "store-a"}
        response = product_routes.get_all_products(
            "store-a", dict(NO_FILTERS), _listing(customer, include_inactive=True)
        )
        self.assertEqual(self._names(response), ["Visible"])

    def test_invalidation_after_write_refreshes_only_that_tenant(self):
        product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        product_routes.get_all_products("store-b", dict(NO_FILTERS), _listing())
        self.fake.docs.append(_product("store-a", "New arrival"))
        cache_module.invalidate_tenant("store-a")

        refreshed = product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        self.assertIn("New arrival", self._names(refreshed))
        product_routes.get_all_products("store-b", dict(NO_FILTERS), _listing())
        self.assertEqual(len(self.fake.find_calls), 3)

    def test_cache_disabled_with_zero_seconds(self):
        with patch.object(cache_module, "STOREFRONT_CACHE_SECONDS", 0):
            product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
            product_routes.get_all_products("store-a", dict(NO_FILTERS), _listing())
        self.assertEqual(len(self.fake.find_calls), 2)


# ---------------------------------------------------------------------------
# Customer list pagination
# ---------------------------------------------------------------------------


class FakeUsers:
    def __init__(self, docs):
        self.docs = docs
        self.cursor = None
        self.count_query = None

    def count_documents(self, query):
        self.count_query = query
        return len(self._matches(query))

    def _matches(self, query):
        return [
            doc
            for doc in self.docs
            if doc["tenantId"] == query["tenantId"] and doc["role"] == query["role"]
        ]

    def find(self, query, projection=None):
        docs = [
            {key: value for key, value in doc.items() if key != "password"}
            for doc in self._matches(query)
        ]
        self.cursor = FakeCursor(docs)
        return self.cursor


class FakeActivity:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def find(self, query, *args):
        self.queries.append(query)
        wanted = set(query["userId"]["$in"])
        return [
            doc
            for doc in self.docs
            if doc["tenantId"] == query["tenantId"] and doc["userId"] in wanted
        ]


class FakeProductNames:
    def find(self, query, projection=None):
        return [
            {"_id": product_id, "name": "Tea", "categoryName": "Drinks"}
            for product_id in query["_id"]["$in"]
        ]


class CustomerPaginationTests(unittest.TestCase):
    def setUp(self):
        self.product_id = ObjectId()
        self.customers = [
            {
                "_id": ObjectId(),
                "tenantId": "store-a",
                "role": "customer",
                "name": f"Customer {index}",
                "password": "hash",
            }
            for index in range(30)
        ]
        other = {
            "_id": ObjectId(),
            "tenantId": "store-b",
            "role": "customer",
            "name": "Other",
            "password": "hash",
        }
        manager = {
            "_id": ObjectId(),
            "tenantId": "store-a",
            "role": "store_manager",
            "name": "Staff",
        }
        self.users = FakeUsers([*self.customers, other, manager])
        self.carts = FakeActivity(
            [
                {
                    "tenantId": "store-a",
                    "userId": customer["_id"],
                    "productId": self.product_id,
                    "quantity": 2,
                }
                for customer in self.customers
            ]
        )
        self.wishlists = FakeActivity([])
        for item in (
            patch.object(users_routes, "users", self.users),
            patch.object(users_routes, "carts", self.carts),
            patch.object(users_routes, "wishlists", self.wishlists),
            patch.object(users_routes, "products", FakeProductNames()),
        ):
            item.start()
            self.addCleanup(item.stop)
        self.admin = {"role": "admin", "tenantId": "store-a"}

    def test_first_page_defaults(self):
        response = users_routes.get_users(self.admin)
        self.assertTrue(response["success"])
        self.assertEqual(response["total"], 30)
        self.assertEqual(response["count"], 25)
        self.assertEqual(response["page"], 1)
        self.assertEqual(response["pageSize"], 25)
        self.assertEqual(len(response["data"]), 25)
        self.assertEqual(self.users.cursor.skip_value, 0)
        self.assertEqual(self.users.cursor.limit_value, 25)
        self.assertEqual(
            self.users.cursor.sort_args[0], [("createdAt", -1), ("_id", -1)]
        )
        first = response["data"][0]
        self.assertNotIn("password", first)
        self.assertEqual(first["activity"]["cartCount"], 2)
        self.assertEqual(first["activity"]["cart"][0]["category"], "Drinks")

    def test_second_page_and_activity_only_for_that_page(self):
        response = users_routes.get_users(self.admin, page=2, page_size=10)
        self.assertEqual(response["count"], 10)
        self.assertEqual(response["total"], 30)
        self.assertEqual(self.users.cursor.skip_value, 10)
        page_ids = [ObjectId(item["_id"]) for item in response["data"]]
        self.assertEqual(self.carts.queries[0]["userId"]["$in"], page_ids)
        self.assertEqual(self.wishlists.queries[0]["userId"]["$in"], page_ids)

    def test_page_size_is_capped(self):
        response = users_routes.get_users(self.admin, page=1, page_size=500)
        self.assertEqual(response["pageSize"], 100)
        self.assertEqual(self.users.cursor.limit_value, 100)

    def test_page_past_the_end_is_empty_and_skips_activity(self):
        response = users_routes.get_users(self.admin, page=5, page_size=25)
        self.assertEqual(response["count"], 0)
        self.assertEqual(response["total"], 30)
        self.assertEqual(self.carts.queries, [])

    def test_scoped_to_admins_tenant_and_customers_only(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            users_routes.get_users(self.admin, tenant_id="store-b")
        users_routes.get_users(self.admin)
        self.assertEqual(
            self.users.count_query, {"tenantId": "store-a", "role": "customer"}
        )


if __name__ == "__main__":
    unittest.main()
