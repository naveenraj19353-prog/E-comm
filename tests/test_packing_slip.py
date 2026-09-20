import json
import unittest

from app.services.delhivery_service import DelhiveryService, render_packing_slip_html


class PackingSlipParseTests(unittest.TestCase):
    def test_json_package_renders_html_without_pdf_field(self):
        payload = {
            "packages_found": 1,
            "packages": [
                {
                    "wbn": "66150910000066",
                    "oid": "1E83B6AD",
                    "cn": "Naveen",
                    "add": "12 MG Road",
                    "pin": "560001",
                    "cty": "Bengaluru",
                    "st": "Karnataka",
                    "ph": "8088662317",
                    "pt": "Prepaid",
                    "prd": "Vedic Paan",
                    "rs": 208.94,
                }
            ],
        }
        body, media = DelhiveryService()._parse_packing_slip(
            json.dumps(payload).encode("utf-8"),
            "application/json",
            waybill="66150910000066",
            fallback=None,
            headers=None,
        )
        self.assertIn("html", media)
        html = body.decode("utf-8")
        self.assertIn("66150910000066", html)
        self.assertIn("Naveen", html)
        self.assertIn("Vedic Paan", html)
        self.assertIn("<svg", html)

    def test_empty_packages_defers_when_no_fields(self):
        payload = {"packages": [], "packages_found": 0}
        parsed = DelhiveryService()._parse_packing_slip(
            json.dumps(payload).encode("utf-8"),
            "application/json",
            waybill="66150910000066",
            fallback={"wbn": "66150910000066", "cn": "Fallback Name"},
            headers=None,
        )
        self.assertIsNone(parsed)

    def test_fallback_html_includes_order_fields(self):
        html = render_packing_slip_html(
            "66150910000066",
            {"wbn": "66150910000066", "cn": "Fallback Name", "pt": "COD", "cod": 99},
        )
        self.assertIn("Fallback Name", html)
        self.assertIn("COD", html)


if __name__ == "__main__":
    unittest.main()
