import unittest
from unittest.mock import patch

from app.services.og_image import first_image_ref, tenant_share_image_ref


class OgImageTests(unittest.TestCase):
    def test_first_image_ref_from_grouped_product_images(self):
        self.assertEqual(
            first_image_ref({"Default": ["tenants/vedic-paan/products/a.jpg"]}),
            "tenants/vedic-paan/products/a.jpg",
        )

    @patch("app.services.og_image.banners")
    def test_tenant_share_image_prefers_active_banner(self, banners):
        banners.find_one.return_value = {
            "image": "tenants/vedic-paan/banners/hero.jpg",
            "priority": 0,
        }
        image = tenant_share_image_ref(
            {"tenantId": "vedic-paan", "slug": "vedic-paan", "logo": "tenants/vedic-paan/logo.png"}
        )
        self.assertEqual(image, "tenants/vedic-paan/banners/hero.jpg")

    @patch("app.services.og_image.banners")
    def test_tenant_share_image_falls_back_to_logo(self, banners):
        banners.find_one.return_value = None
        image = tenant_share_image_ref(
            {"tenantId": "your-store", "slug": "your-store", "logo": "tenants/your-store/logo.png"}
        )
        self.assertEqual(image, "tenants/your-store/logo.png")


if __name__ == "__main__":
    unittest.main()
