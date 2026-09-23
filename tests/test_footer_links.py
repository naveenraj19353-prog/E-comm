import unittest

from app.services.footer_links import normalize_footer_sections, resolve_footer_href
from app.services.about_content import merge_about_content
from app.services.storefront_layout import build_storefront_layout


class FooterLinkTests(unittest.TestCase):
    def test_maps_placeholder_privacy_and_returns(self):
        self.assertEqual(resolve_footer_href("Privacy Policy", "#"), "/privacy")
        self.assertEqual(resolve_footer_href("Returns", "#"), "/returns")
        self.assertEqual(resolve_footer_href("Shipping", ""), "/shipping")
        self.assertEqual(resolve_footer_href("About", "#"), "/about")

    def test_keeps_custom_urls(self):
        self.assertEqual(
            resolve_footer_href("About", "https://example.com/about"),
            "https://example.com/about",
        )

    def test_drops_unknown_hash_links(self):
        sections = normalize_footer_sections(
            [
                {
                    "title": "Company",
                    "links": [
                        {"label": "About", "href": "#"},
                        {"label": "Careers", "href": "#"},
                    ],
                }
            ]
        )
        self.assertEqual(sections, [
            {"title": "Company", "links": [{"label": "About", "href": "/about"}]},
        ])

    def test_layout_defaults_include_legal_paths(self):
        layout = build_storefront_layout({"name": "Boutique"})
        hrefs = {
            link["href"]
            for section in layout["footerContent"]["sections"]
            for link in section["links"]
        }
        self.assertIn("/privacy", hrefs)
        self.assertIn("/terms", hrefs)
        self.assertIn("/returns", hrefs)
        self.assertIn("/shipping", hrefs)
        self.assertIn("/about", hrefs)
        self.assertNotIn("#", hrefs)

    def test_menu_and_service_defaults_skip_retail_pages(self):
        for business_type in ("menu", "service"):
            layout = build_storefront_layout(
                {"name": "Cafe", "businessType": business_type}
            )
            hrefs = {
                link["href"]
                for section in layout["footerContent"]["sections"]
                for link in section["links"]
            }
            self.assertIn("/privacy", hrefs)
            self.assertIn("/about", hrefs)
            for retail_only in ("/terms", "/returns", "/shipping"):
                self.assertNotIn(retail_only, hrefs, business_type)

    def test_saved_fashion_placeholders_remap(self):
        layout = build_storefront_layout(
            {
                "name": "Boutique",
                "footerContent": {
                    "sections": [
                        {
                            "title": "Support",
                            "links": [
                                {"label": "Returns", "href": "#"},
                                {"label": "Privacy Policy", "href": "#"},
                            ],
                        }
                    ]
                },
            }
        )
        links = layout["footerContent"]["sections"][0]["links"]
        self.assertEqual(links[0]["href"], "/returns")
        self.assertEqual(links[1]["href"], "/privacy")


class AboutContentTests(unittest.TestCase):
    def test_defaults_use_store_name(self):
        about = merge_about_content({"name": "Boutique"})
        headings = [item["heading"] for item in about["sections"]]
        self.assertEqual(headings[0], "What you can do here")
        self.assertEqual(headings[2], "Powered by Retail Cosmos")
        self.assertIn("Boutique", about["sections"][1]["body"])

    def test_saved_sections_override_defaults(self):
        about = merge_about_content(
            {
                "name": "Boutique",
                "aboutContent": {
                    "sections": [
                        {"heading": "Shop with us", "body": "Custom first section."},
                    ]
                },
            }
        )
        self.assertEqual(about["sections"][0]["heading"], "Shop with us")
        self.assertEqual(about["sections"][0]["body"], "Custom first section.")
        self.assertEqual(about["sections"][2]["heading"], "Powered by Retail Cosmos")

    def test_layout_includes_about_content(self):
        layout = build_storefront_layout({"name": "Boutique"})
        self.assertEqual(len(layout["aboutContent"]["sections"]), 3)


if __name__ == "__main__":
    unittest.main()
