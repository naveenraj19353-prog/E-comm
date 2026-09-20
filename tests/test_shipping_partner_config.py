import unittest

from app.services.shipping_partner_config import (
    extract_path,
    interpolate_vars,
    map_response,
    default_provider_id,
    get_partner_spec,
    get_operation,
    partner_base_url,
)


class ShippingPartnerConfigTests(unittest.TestCase):
    def test_delhivery_is_in_catalog(self):
        spec = get_partner_spec("delhivery")
        self.assertEqual(spec["displayName"], "Delhivery")
        self.assertTrue(get_operation("delhivery", "rate")["path"])
        self.assertTrue(partner_base_url("delhivery"))
        self.assertEqual(default_provider_id(), "delhivery")

    def test_extract_total_amount(self):
        payload = [{"total_amount": 68.94, "gross_amount": 58.42}]
        self.assertEqual(extract_path(payload, "0.total_amount"), 68.94)
        mapped = map_response(
            payload, {"shippingCost": {"path": "0.total_amount", "number": True}}
        )
        self.assertEqual(mapped["shippingCost"], 68.94)

    def test_query_templates(self):
        filled = interpolate_vars(
            {"d_pin": "{destinationPin}", "md": "{md}"},
            {"destinationPin": "110001", "md": "S"},
        )
        self.assertEqual(filled["d_pin"], "110001")
        self.assertEqual(filled["md"], "S")


if __name__ == "__main__":
    unittest.main()
