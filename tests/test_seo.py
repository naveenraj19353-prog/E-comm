"""SEO: crawler classification, sitemaps, robots.txt, crawler pages, analytics ids.

Everything runs against in-memory fakes; nothing touches MongoDB or the network.
"""

import json
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from bson import ObjectId
from pydantic import ValidationError
from starlette.requests import Request

from app.models.tenant import UpdateTenant
from app.routes import seo
from app.routes import tenant as tenant_routes
from app.services import billing_service, storefront_url
from app.services.store_analytics import (
    normalize_ga4_measurement_id,
    normalize_meta_pixel_id,
    normalize_store_analytics,
    public_store_analytics,
)

ROOT = Path(__file__).resolve().parents[1]
EDGE_FUNCTION = ROOT / "client" / "netlify" / "edge-functions" / "product-og.ts"
SERVER_CJS = ROOT / "client" / "server.cjs"
VERCEL_JSON = ROOT / "client" / "vercel.json"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


def _matches(doc: dict, query: dict) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, sub) for sub in expected):
                return False
            continue
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$regex" in expected:
                flags = re.I if "i" in expected.get("$options", "") else 0
                if not isinstance(actual, str) or not re.search(expected["$regex"], actual, flags):
                    return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
            if "$exists" in expected and (key in doc) != expected["$exists"]:
                return False
            continue
        if actual != expected:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, key, direction=None):
        keys = key if isinstance(key, list) else [(key, direction or 1)]
        for field, order in reversed(keys):
            self._docs.sort(key=lambda d: str(d.get(field) or ""), reverse=order == -1)
        return self

    def skip(self, count):
        self._docs = self._docs[count:]
        return self

    def limit(self, count):
        self._docs = self._docs[:count] if count else self._docs
        return self

    def __iter__(self):
        return iter(self._docs)


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query=None, projection=None):
        return _Cursor(d for d in self.docs if _matches(d, query or {}))

    def find_one(self, query=None, *args, **kwargs):
        return next((d for d in self.docs if _matches(d, query or {})), None)

    def count_documents(self, query):
        return sum(1 for d in self.docs if _matches(d, query))

    def aggregate(self, pipeline):
        match = pipeline[0]["$match"]
        groups: dict = {}
        for doc in self.docs:
            if _matches(doc, match):
                groups.setdefault(doc["categoryId"], doc.get("categoryName"))
        return [{"_id": key, "name": name} for key, name in sorted(groups.items())]

    def update_one(self, *args, **kwargs):  # billing transitions: never persisted
        pass


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"",
            "scheme": "https",
            "server": ("api.example.com", 443),
            "root_path": "",
        }
    )


def _tenant(slug, **extra):
    return {
        "_id": ObjectId(),
        "tenantId": slug,
        "slug": slug,
        "name": extra.pop("name", slug.title()),
        "isActive": True,
        "businessType": "retail",
        "updatedAt": datetime(2026, 9, 1, tzinfo=timezone.utc),
        **extra,
    }


def _product(tenant_id, name, active=True, category="SHOES", **extra):
    return {
        "_id": ObjectId(),
        "tenantId": tenant_id,
        "name": name,
        "description": extra.pop("description", f"{name} description"),
        "categoryId": category,
        "categoryName": category.title(),
        "price": 1000,
        "finalPrice": 800,
        "inventory": [{"variantId": "a", "color": "Red", "size": "M", "stock": 3}],
        "images": {"Red": [f"tenants/{tenant_id}/products/{name}.jpg"]},
        "isActive": active,
        "createdAt": datetime(2026, 8, 1, tzinfo=timezone.utc),
        "updatedAt": datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
        **extra,
    }


class _SeoFixture(unittest.TestCase):
    subdomains = True

    def setUp(self):
        self.shop = _tenant("shop", name="Shop & Co")
        self.suspended = _tenant("gone", billing={"status": "suspended"})
        self.inactive_store = _tenant("off", isActive=False)
        self.live = _product("shop", "Runner")
        self.hidden = _product("shop", "Hidden", active=False, category="HATS")
        self.other = _product("gone", "Elsewhere")
        self.tenants = FakeCollection([self.shop, self.suspended, self.inactive_store])
        self.products = FakeCollection([self.live, self.hidden, self.other])
        routing = {
            "TENANT_SUBDOMAIN_ROUTING": self.subdomains,
            "FRONTEND_URL": "https://app.retailcosmos.com",
            "TENANT_BASE_DOMAIN": "retailcosmos.com",
        }
        patches = [
            patch.object(seo, "tenants", self.tenants),
            patch.object(seo, "products", self.products),
            patch.object(seo, "TENANT_BASE_DOMAIN", "retailcosmos.com"),
            patch.object(seo, "ROOT_DOMAIN", "retailcosmos.com"),
            patch.object(seo, "FRONTEND_URL", "https://app.retailcosmos.com"),
            patch.object(billing_service, "tenants", FakeCollection([])),
            *(patch.object(storefront_url, key, value) for key, value in routing.items()),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)


# ---------------------------------------------------------------------------
# Bot classification (reads the regexes actually deployed)
# ---------------------------------------------------------------------------


def _js_regex(source: str, name: str) -> re.Pattern:
    match = re.search(rf"const {name} = /(.+)/i;", source)
    assert match, f"{name} not found"
    return re.compile(match.group(1).replace("\\/", "/"), re.I)


SEARCH_UAS = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
]
SOCIAL_UAS = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "WhatsApp/2.23.20.0 A",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TelegramBot (like TwitterBot)",
]
HUMAN_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1;FBDV/iPhone15,2]",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile "
    "Safari/537.36 Instagram 340.0.0.0 Android",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Mobile/15E148 [Pinterest/iOS]",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 LinkedInApp",
]


class BotClassificationTests(unittest.TestCase):
    def _classify(self, search, social, ua):
        if search.search(ua):
            return "search"
        if social.search(ua):
            return "social"
        return None

    def _check_file(self, path: Path):
        source = path.read_text(encoding="utf-8")
        search = _js_regex(source, "SEARCH_CRAWLER_UA")
        social = _js_regex(source, "SOCIAL_PREVIEW_UA")
        for ua in SEARCH_UAS:
            self.assertEqual(self._classify(search, social, ua), "search", ua)
        for ua in SOCIAL_UAS:
            self.assertEqual(self._classify(search, social, ua), "social", ua)
        for ua in HUMAN_UAS:
            self.assertIsNone(self._classify(search, social, ua), ua)
        return search.pattern, social.pattern

    def test_edge_function_classification(self):
        self._check_file(EDGE_FUNCTION)

    def test_server_cjs_matches_edge_function(self):
        self.assertEqual(self._check_file(SERVER_CJS), self._check_file(EDGE_FUNCTION))

    def test_edge_function_never_marks_search_pages_noindex(self):
        source = EDGE_FUNCTION.read_text(encoding="utf-8")
        body = source[source.index("async function serveSearchCrawler") : source.index("async function serveSocialPreview")]
        ok_branch = body[body.index("if (upstream.ok)") : body.index("if (upstream.status === 404)")]
        self.assertNotIn("noindex", ok_branch)

    def test_vercel_user_agent_rule_matches_search_crawlers_only(self):
        config = json.loads(VERCEL_JSON.read_text(encoding="utf-8"))
        values = {
            cond["value"]
            for rule in config["rewrites"]
            for cond in rule.get("has", [])
            if cond.get("key") == "user-agent"
        }
        self.assertEqual(len(values), 1)
        pattern = re.compile(values.pop())
        for ua in SEARCH_UAS:
            self.assertTrue(pattern.fullmatch(ua), ua)
        for ua in SOCIAL_UAS + HUMAN_UAS:
            self.assertFalse(pattern.fullmatch(ua), ua)


# ---------------------------------------------------------------------------
# Sitemaps + robots.txt
# ---------------------------------------------------------------------------


class SubdomainSitemapTests(_SeoFixture):
    subdomains = True

    def test_store_sitemap_uses_subdomain_urls_and_skips_inactive_products(self):
        response = seo.sitemap(host="shop.retailcosmos.com", slug=None, tenantId=None, page=None)
        self.assertEqual(response.status_code, 200)
        xml = response.body.decode()
        self.assertIn("<loc>https://shop.retailcosmos.com/</loc>", xml)
        self.assertIn(f"<loc>https://shop.retailcosmos.com/product-details/{self.live['_id']}</loc>", xml)
        self.assertIn("<lastmod>2026-09-10T12:00:00+00:00</lastmod>", xml)
        self.assertIn("https://shop.retailcosmos.com/products?categoryIds=SHOES", xml)
        self.assertNotIn(str(self.hidden["_id"]), xml)
        self.assertNotIn("categoryIds=HATS", xml)  # only inactive products there
        self.assertNotIn(str(self.other["_id"]), xml)

    def test_lookup_by_tenant_id(self):
        response = seo.sitemap(host=None, slug=None, tenantId="SHOP", page=None)
        self.assertEqual(response.status_code, 200)
        self.assertIn(str(self.live["_id"]), response.body.decode())

    def test_suspended_and_inactive_stores_have_no_sitemap(self):
        for slug in ("gone", "off", "missing"):
            response = seo.sitemap(host=None, slug=slug, tenantId=None, page=None)
            self.assertEqual(response.status_code, 404, slug)
            self.assertNotIn("<loc>", response.body.decode())

    def test_platform_index_lists_live_stores_only(self):
        xml = seo.sitemap(host="retailcosmos.com", slug=None, tenantId=None, page=None).body.decode()
        self.assertIn("<sitemapindex", xml)
        self.assertIn("<loc>https://retailcosmos.com/sitemap-platform.xml</loc>", xml)
        self.assertIn("<loc>https://shop.retailcosmos.com/sitemap.xml</loc>", xml)
        self.assertNotIn("gone", xml)
        self.assertNotIn("off.retailcosmos.com", xml)

    def test_platform_sitemap_pages(self):
        xml = seo.platform_sitemap(host="retailcosmos.com").body.decode()
        for path in ("/", "/create-store", "/legal/about", "/legal/privacy", "/legal/terms"):
            self.assertIn(f"<loc>https://retailcosmos.com{path}</loc>", xml)

    def test_unknown_host_is_not_echoed(self):
        xml = seo.platform_sitemap(host="evil.example").body.decode()
        self.assertNotIn("evil.example", xml)

    def test_large_store_is_split_into_sitemap_index(self):
        self.products.docs.extend(_product("shop", f"P{i}") for i in range(12))
        index = seo.build_store_sitemap(self.shop, page=None, per_file=10)
        self.assertIn("<sitemapindex", index)
        self.assertIn("https://shop.retailcosmos.com/sitemap.xml?page=2", index)
        page_one = seo.build_store_sitemap(self.shop, page=1, per_file=10)
        page_two = seo.build_store_sitemap(self.shop, page=2, per_file=10)
        urls = re.findall(r"<loc>(.*?)</loc>", page_one + page_two)
        self.assertEqual(len(urls), len(set(urls)))
        self.assertEqual(len(urls), 4 + 1 + 13)  # static pages + 1 category + 13 products
        self.assertIsNone(seo.build_store_sitemap(self.shop, page=3, per_file=10))

    def test_store_robots(self):
        text = seo.robots_txt(host="shop.retailcosmos.com", slug=None).body.decode()
        for path in ("/admin", "/cart", "/checkout", "/orders", "/profile", "/login"):
            self.assertIn(f"Disallow: {path}\n", text)
        self.assertIn("Sitemap: https://shop.retailcosmos.com/sitemap.xml", text)

    def test_suspended_store_robots_has_no_sitemap(self):
        text = seo.robots_txt(host="gone.retailcosmos.com", slug=None).body.decode()
        self.assertNotIn("Sitemap:", text)

    def test_platform_robots(self):
        text = seo.robots_txt(host="retailcosmos.com", slug=None).body.decode()
        self.assertIn("Disallow: /admin", text)
        self.assertIn("Disallow: /*/checkout", text)
        self.assertIn("Sitemap: https://retailcosmos.com/sitemap.xml", text)


class PathModeSitemapTests(_SeoFixture):
    subdomains = False

    def test_store_sitemap_uses_path_urls(self):
        xml = seo.sitemap(host=None, slug="shop", tenantId=None, page=None).body.decode()
        self.assertIn("<loc>https://app.retailcosmos.com/shop</loc>", xml)
        self.assertIn(f"<loc>https://app.retailcosmos.com/shop/product-details/{self.live['_id']}</loc>", xml)
        self.assertNotIn("shop.retailcosmos.com", xml)
        self.assertNotIn(str(self.hidden["_id"]), xml)

    def test_platform_index_points_at_path_mode_store_sitemaps(self):
        xml = seo.sitemap(host="app.retailcosmos.com", slug=None, tenantId=None, page=None).body.decode()
        self.assertIn("<loc>https://app.retailcosmos.com/shop/sitemap.xml</loc>", xml)
        self.assertIn("<loc>https://app.retailcosmos.com/sitemap-platform.xml</loc>", xml)

    def test_crawler_canonical_uses_path_url(self):
        html = seo.crawler_product_detail("shop", str(self.live["_id"]), _request()).body.decode()
        self.assertIn(
            f'<link rel="canonical" href="https://app.retailcosmos.com/shop/product-details/{self.live["_id"]}" />',
            html,
        )


# ---------------------------------------------------------------------------
# Crawler pages
# ---------------------------------------------------------------------------


class CrawlerPageTests(_SeoFixture):
    subdomains = True

    def test_product_page_is_indexable_with_json_ld(self):
        response = seo.crawler_product_detail("shop", str(self.live["_id"]), _request())
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("x-robots-tag", response.headers)
        html = response.body.decode()
        self.assertIn('<meta name="robots" content="index, follow" />', html)
        self.assertNotIn("noindex", html)
        self.assertNotIn("http-equiv", html)  # no meta refresh for crawlers
        self.assertIn("<h1>Runner</h1>", html)
        self.assertIn("₹800", html)
        self.assertIn('href="https://shop.retailcosmos.com/products?categoryIds=SHOES"', html)
        ld = [json.loads(block) for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html)]
        product = next(item for item in ld if item["@type"] == "Product")
        self.assertEqual(product["offers"]["price"], "800.00")
        self.assertEqual(product["offers"]["priceCurrency"], "INR")
        self.assertEqual(product["offers"]["availability"], "https://schema.org/InStock")
        self.assertEqual(
            product["image"], [f"https://api.example.com/og/product/shop/{self.live['_id']}/image"]
        )

    def test_out_of_stock_product(self):
        self.live["inventory"] = [{"variantId": "a", "color": "Red", "size": "M", "stock": 0}]
        html = seo.crawler_product_detail("shop", str(self.live["_id"]), _request()).body.decode()
        self.assertIn("https://schema.org/OutOfStock", html)

    def test_inactive_product_is_404_noindex(self):
        response = seo.crawler_product_detail("shop", str(self.hidden["_id"]), _request())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers["x-robots-tag"], "noindex")
        self.assertIn("noindex", response.body.decode())

    def test_suspended_and_inactive_store_pages_are_404(self):
        for slug in ("gone", "off"):
            response = seo.crawler_store_home(slug, _request())
            self.assertEqual(response.status_code, 404, slug)
            self.assertEqual(response.headers["x-robots-tag"], "noindex")
        response = seo.crawler_product_detail("gone", str(self.other["_id"]), _request())
        self.assertEqual(response.status_code, 404)

    def test_store_home_links_products_and_categories(self):
        response = seo.crawler_store_home("shop", _request())
        self.assertEqual(response.status_code, 200)
        html = response.body.decode()
        self.assertIn('<link rel="canonical" href="https://shop.retailcosmos.com/" />', html)
        self.assertIn(f'href="https://shop.retailcosmos.com/product-details/{self.live["_id"]}"', html)
        self.assertIn('href="https://shop.retailcosmos.com/products?categoryIds=SHOES"', html)
        self.assertNotIn(str(self.hidden["_id"]), html)
        self.assertIn('"@type":"Store"', html)
        self.assertIn("<h1>Shop &amp; Co</h1>", html)

    def test_listing_and_category_pages(self):
        html = seo.crawler_product_listing("shop", _request(), categoryIds=["SHOES"], category=None, page=1).body.decode()
        self.assertIn(str(self.live["_id"]), html)
        self.assertIn('<link rel="canonical" href="https://shop.retailcosmos.com/products?categoryIds=SHOES" />', html)
        empty = seo.crawler_product_listing("shop", _request(), categoryIds=["HATS"], category=None, page=1)
        self.assertEqual(empty.status_code, 404)
        past_end = seo.crawler_product_listing("shop", _request(), categoryIds=None, category=None, page=9)
        self.assertEqual(past_end.status_code, 404)

    def test_user_content_is_escaped(self):
        payload = '</script><script>alert(1)</script><img src=x onerror=alert(2)>"\''
        self.live["name"] = payload
        self.live["description"] = payload + "\n\nsecond </title> para"
        self.live["brand"] = payload
        self.live["categoryName"] = payload
        self.shop["name"] = payload
        self.shop["footerContent"] = {"description": payload}
        for response in (
            seo.crawler_product_detail("shop", str(self.live["_id"]), _request()),
            seo.crawler_store_home("shop", _request()),
            seo.crawler_product_listing("shop", _request(), categoryIds=None, category=None, page=1),
        ):
            html = response.body.decode()
            self.assertNotIn("<script>alert", html)
            self.assertNotIn("<img src=x", html)
            self.assertNotIn("</title> para", html)
            # Only our own script tags exist, and each JSON-LD block parses.
            self.assertEqual(html.count("<script"), html.count('<script type="application/ld+json">'))
            for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
                json.loads(block)
            self.assertIn("&lt;/script&gt;", html)

    def test_json_ld_script_cannot_break_out(self):
        tag = seo.json_ld_script({"name": "</script><b>x</b>&"})
        self.assertEqual(tag.count("</script>"), 1)
        self.assertTrue(tag.endswith("</script>"))
        self.assertEqual(json.loads(tag[tag.index(">") + 1 : -len("</script>")])["name"], "</script><b>x</b>&")


# ---------------------------------------------------------------------------
# Analytics ids
# ---------------------------------------------------------------------------


class StoreAnalyticsTests(unittest.TestCase):
    def test_ga4_validation(self):
        self.assertEqual(normalize_ga4_measurement_id(" g-ab12cd34ef "), "G-AB12CD34EF")
        self.assertIsNone(normalize_ga4_measurement_id(""))
        self.assertIsNone(normalize_ga4_measurement_id(None))
        for bad in ("UA-12345-1", "G-", "G-ABC<script>", "AW-123456789", "G-ABCD EFGH"):
            with self.assertRaises(ValueError, msg=bad):
                normalize_ga4_measurement_id(bad)

    def test_meta_pixel_validation(self):
        self.assertEqual(normalize_meta_pixel_id(" 123456789012345 "), "123456789012345")
        self.assertIsNone(normalize_meta_pixel_id(""))
        for bad in ("12ab", "1234", "123456789012345'", "-123456789"):
            with self.assertRaises(ValueError, msg=bad):
                normalize_meta_pixel_id(bad)

    def test_update_model_validates_and_allows_clearing(self):
        model = UpdateTenant(analytics={"ga4MeasurementId": "g-abc123xyz9", "metaPixelId": ""})
        self.assertEqual(
            model.model_dump(exclude_unset=True)["analytics"],
            {"ga4MeasurementId": "G-ABC123XYZ9", "metaPixelId": None},
        )
        with self.assertRaises(ValidationError):
            UpdateTenant(analytics={"ga4MeasurementId": "UA-1-1"})
        with self.assertRaises(ValidationError):
            UpdateTenant(analytics={"metaPixelId": "abc"})

    def test_normalize_store_analytics(self):
        self.assertEqual(
            normalize_store_analytics({"ga4MeasurementId": "G-ABCDEF12", "metaPixelId": "99999999"}),
            {"ga4MeasurementId": "G-ABCDEF12", "metaPixelId": "99999999"},
        )

    def test_public_payload_drops_invalid_stored_values(self):
        self.assertEqual(
            public_store_analytics({"analytics": {"ga4MeasurementId": "G-\"><script>", "metaPixelId": "1234567"}}),
            {"ga4MeasurementId": None, "metaPixelId": "1234567"},
        )
        self.assertEqual(public_store_analytics({}), {"ga4MeasurementId": None, "metaPixelId": None})

    def test_public_storefront_tenant_includes_analytics(self):
        tenant = _tenant("shop", analytics={"ga4MeasurementId": "G-ABCDEF12", "metaPixelId": "123456789"})
        tenant["platformCommissionPercent"] = 4
        payload = tenant_routes._public_storefront_tenant(tenant)
        self.assertEqual(payload["analytics"], {"ga4MeasurementId": "G-ABCDEF12", "metaPixelId": "123456789"})
        self.assertNotIn("platformCommissionPercent", payload)


if __name__ == "__main__":
    unittest.main()
