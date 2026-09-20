import re
import unittest

from app.config import (
    CORS_ORIGINS,
    ROOT_DOMAIN,
    resolve_cors_origin_regex,
    tenant_subdomain_cors_regex,
)


class CorsConfigTests(unittest.TestCase):
    def test_explicit_origins_include_apex_www_and_local(self):
        self.assertIn(f"https://{ROOT_DOMAIN}", CORS_ORIGINS)
        self.assertIn(f"https://www.{ROOT_DOMAIN}", CORS_ORIGINS)
        self.assertIn("http://localhost:5173", CORS_ORIGINS)
        self.assertIn("http://127.0.0.1:5173", CORS_ORIGINS)
        self.assertNotIn("*", CORS_ORIGINS)

    def test_tenant_hosts_match_regex(self):
        pattern = re.compile(tenant_subdomain_cors_regex("retailcosmos.com"))
        for origin in (
            "https://shopsphere.retailcosmos.com",
            "https://unimart.retailcosmos.com",
            "https://vedic-paan.retailcosmos.com",
            "https://new-store.retailcosmos.com",
        ):
            self.assertIsNotNone(pattern.fullmatch(origin), origin)

    def test_foreign_hosts_do_not_match_regex(self):
        pattern = re.compile(tenant_subdomain_cors_regex("retailcosmos.com"))
        for origin in (
            "https://evil-example.com",
            "https://retailcosmos.com.evil-example.com",
            "https://tenant.retailcosmos.com.evil-example.com",
            "https://a.b.retailcosmos.com",
            "http://vedic-paan.retailcosmos.com",
        ):
            self.assertIsNone(pattern.fullmatch(origin), origin)

    def test_unanchored_env_regex_is_ignored(self):
        built = resolve_cors_origin_regex(
            "retailcosmos.com",
            r"https://([a-z0-9-]+\.)*retailcosmos\.com",
        )
        self.assertEqual(built, tenant_subdomain_cors_regex("retailcosmos.com"))

    def test_anchored_env_regex_is_kept(self):
        custom = r"^https://[a-z0-9-]+\.example\.com$"
        self.assertEqual(resolve_cors_origin_regex("retailcosmos.com", custom), custom)


if __name__ == "__main__":
    unittest.main()
