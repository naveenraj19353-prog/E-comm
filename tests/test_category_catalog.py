import unittest
from unittest.mock import patch

from app.utils.category_catalog import (
    _catalog_category,
    _first_product_image,
)


class CategoryCatalogImageTests(unittest.TestCase):
    def test_first_product_image_prefers_photo_over_video(self):
        image = _first_product_image(
            {
                "Default": [
                    "tenants/store/products/clip.mp4",
                    "tenants/store/products/paan.jpg",
                ]
            }
        )
        self.assertEqual(image, "tenants/store/products/paan.jpg")

    def test_catalog_category_presigns_s3_key(self):
        row = {
            "_id": "sweet-paan",
            "name": "Sweet Paan",
            "productCount": 1,
            "sampleImages": {
                "Default": ["tenants/store/products/paan.jpg"],
            },
        }
        with patch(
            "app.utils.category_catalog._resolve_image_for_response",
            return_value="https://cdn.example/paan.jpg?sig=1",
        ):
            category = _catalog_category(row, "store", {}, {})
        self.assertEqual(
            category["image"],
            "https://cdn.example/paan.jpg?sig=1",
        )


if __name__ == "__main__":
    unittest.main()
