import unittest

from app.utils.phone_normalization import (
    PhoneNormalizationError,
    mask_phone,
    normalize_phone,
)


class PhoneNormalizationTests(unittest.TestCase):
    def test_accepts_international_formats(self):
        self.assertEqual(normalize_phone("+91 98454 59636"), "919845459636")
        self.assertEqual(normalize_phone("919845459636"), "919845459636")

    def test_uses_known_country_for_national_number(self):
        self.assertEqual(
            normalize_phone("9845459636", country="India"),
            "919845459636",
        )
        self.assertEqual(
            normalize_phone("08088662317", country="India"),
            "918088662317",
        )

    def test_does_not_guess_country(self):
        with self.assertRaises(PhoneNormalizationError):
            normalize_phone("9845459636")

    def test_missing_and_invalid_numbers_fail(self):
        with self.assertRaises(PhoneNormalizationError):
            normalize_phone("")
        with self.assertRaises(PhoneNormalizationError):
            normalize_phone("1234", country="India")

    def test_masks_phone(self):
        self.assertEqual(mask_phone("919845459636"), "********9636")


if __name__ == "__main__":
    unittest.main()
