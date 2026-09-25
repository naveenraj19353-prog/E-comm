"""Business details (REQ-011), social links (INT-013), storefront font (REQ-070)
and SKU search (REQ-022)."""

import unittest
from unittest.mock import patch

from bson import ObjectId
from pydantic import ValidationError

from app.models.tenant import BusinessDetails, LayoutSettings, SocialLinks, UpdateTenant
from app.routes import product as product_routes
from app.routes import tenant as tenant_routes
from app.services.store_profile import normalize_gstin, normalize_social_link
from app.services.storefront_layout import DEFAULT_LAYOUT_SETTINGS
from tests.mongo_fakes import FakeCollection


class GstinTests(unittest.TestCase):
    def test_valid_gstin_is_upper_cased_and_trimmed(self):
        self.assertEqual(normalize_gstin(" 29abcde1234f1z5 "), "29ABCDE1234F1Z5")
        self.assertEqual(normalize_gstin("27 AAPFU 0939F 1ZV"), "27AAPFU0939F1ZV")

    def test_empty_gstin_clears_it(self):
        self.assertIsNone(normalize_gstin(""))
        self.assertIsNone(normalize_gstin(None))

    def test_invalid_gstin_is_rejected(self):
        for value in ("29ABCDE1234F1Z", "29ABCDE1234F1X5", "ABCDE1234F1Z529", "29ABCDE1234F0Z5"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_gstin(value)


class BusinessDetailsTests(unittest.TestCase):
    def test_blank_fields_become_none_and_gstin_is_checked(self):
        details = BusinessDetails(legalName="  Vedic Paan Pvt Ltd ", city="", gstin="29abcde1234f1z5")
        self.assertEqual(details.legalName, "Vedic Paan Pvt Ltd")
        self.assertIsNone(details.city)
        self.assertEqual(details.gstin, "29ABCDE1234F1Z5")

        with self.assertRaises(ValidationError):
            BusinessDetails(gstin="not-a-gstin")
        with self.assertRaises(ValidationError):
            BusinessDetails(taxRate=18)  # unknown fields are not accepted


class SocialLinkTests(unittest.TestCase):
    def test_https_links_on_the_platform_domain_are_accepted(self):
        self.assertEqual(
            normalize_social_link("instagram", " https://www.instagram.com/vedicpaan "),
            "https://www.instagram.com/vedicpaan",
        )
        self.assertEqual(normalize_social_link("x", "https://twitter.com/shop"), "https://twitter.com/shop")
        self.assertEqual(normalize_social_link("youtube", "https://youtu.be/abc"), "https://youtu.be/abc")
        self.assertIsNone(normalize_social_link("facebook", ""))

    def test_unsafe_or_foreign_links_are_rejected(self):
        for platform, value in (
            ("instagram", "http://instagram.com/shop"),
            ("instagram", "javascript:alert(1)"),
            ("instagram", "https://evil-instagram.com/shop"),
            ("instagram", "https://instagram.com.evil.com/shop"),
            ("facebook", "https://user:pass@facebook.com/shop"),
            ("linkedin", "https://facebook.com/shop"),
            ("youtube", "https://youtube.com/" + "a" * 300),
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_social_link(platform, value)

    def test_model_validates_each_platform(self):
        links = SocialLinks(instagram="https://instagram.com/shop", facebook="")
        self.assertEqual(links.instagram, "https://instagram.com/shop")
        self.assertIsNone(links.facebook)
        with self.assertRaises(ValidationError):
            SocialLinks(instagram="https://facebook.com/shop")
        with self.assertRaises(ValidationError):
            SocialLinks(tiktok="https://tiktok.com/@shop")


class FontTests(unittest.TestCase):
    def test_only_listed_fonts_are_accepted(self):
        self.assertEqual(LayoutSettings(fontFamily="poppins").fontFamily, "poppins")
        with self.assertRaises(ValidationError):
            LayoutSettings(fontFamily="Comic Sans")
        with self.assertRaises(ValidationError):
            LayoutSettings(fontFamily="https://evil.example/font.css")

    def test_default_font_keeps_the_current_look(self):
        self.assertEqual(DEFAULT_LAYOUT_SETTINGS["fontFamily"], "default")


class UpdateTenantRouteTests(unittest.TestCase):
    def setUp(self):
        self.tenant_id = ObjectId()
        self.tenants = FakeCollection("tenants")
        self.tenants.docs.append(
            {
                "_id": self.tenant_id,
                "tenantId": "store-a",
                "name": "Store A",
                "slug": "store-a",
                "businessDetails": {"legalName": "Old Name", "city": "Mysuru", "gstin": "29ABCDE1234F1Z5"},
            }
        )
        for patcher in (
            patch.object(tenant_routes, "tenants", self.tenants),
            patch.object(tenant_routes, "invalidate_tenant"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.owner = {"role": "admin", "tenantId": "store-a"}

    def update(self, **fields):
        return tenant_routes.update_tenant(str(self.tenant_id), UpdateTenant(**fields), self.owner)

    def test_business_details_and_social_links_are_saved_and_returned(self):
        response = self.update(
            businessDetails={"legalName": "Store A Pvt Ltd", "addressLine1": "12 MG Road", "gstin": "29abcde1234f1z5"},
            socialLinks={"instagram": "https://instagram.com/storea"},
        )

        saved = self.tenants.docs[0]
        self.assertEqual(saved["businessDetails"]["legalName"], "Store A Pvt Ltd")
        self.assertEqual(saved["businessDetails"]["gstin"], "29ABCDE1234F1Z5")
        # The whole block is replaced, so a field left out of the form is cleared.
        self.assertIsNone(saved["businessDetails"]["city"])
        self.assertEqual(saved["socialLinks"]["instagram"], "https://instagram.com/storea")
        self.assertIsNone(saved["socialLinks"]["facebook"])
        self.assertEqual(response["data"]["businessDetails"]["addressLine1"], "12 MG Road")

    def test_other_updates_leave_business_details_alone(self):
        self.update(name="Store A Renamed")
        self.assertEqual(self.tenants.docs[0]["businessDetails"]["legalName"], "Old Name")

    def test_invalid_values_never_reach_the_database(self):
        with self.assertRaises(ValidationError):
            UpdateTenant(socialLinks={"instagram": "javascript:alert(1)"})
        with self.assertRaises(ValidationError):
            UpdateTenant(businessDetails={"gstin": "12345"})


class SkuSearchTests(unittest.TestCase):
    def test_admin_search_also_matches_sku(self):
        query: dict = {}
        product_routes._add_search_filter(query, "NK-TS-BLK")

        fields = [next(iter(condition)) for condition in query["$or"]]
        self.assertIn("inventory.variantId", fields)
        self.assertEqual(query["$or"][fields.index("inventory.variantId")]["inventory.variantId"]["$regex"], "NK\\-TS\\-BLK")


if __name__ == "__main__":
    unittest.main()
