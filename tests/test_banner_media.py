import unittest

from app.models.banner import CreateBanner
from app.utils.product_serialize import is_banner_video_src, resolve_banner_images


class BannerMediaTests(unittest.TestCase):
    def test_detects_video_extension(self):
        self.assertTrue(is_banner_video_src("tenants/store/banners/hero.mp4"))
        self.assertTrue(is_banner_video_src("https://cdn.example/a.webm?token=1"))
        self.assertFalse(is_banner_video_src("tenants/store/banners/hero.jpg"))

    def test_resolve_sets_video_media_type(self):
        data = resolve_banner_images(
            {
                "title": "Hero",
                "image": "https://cdn.example/hero.mp4",
            }
        )
        self.assertEqual(data["mediaType"], "video")
        self.assertEqual(data["image"], "https://cdn.example/hero.mp4")

    def test_create_banner_accepts_video_without_title(self):
        banner = CreateBanner(
            tenantId="vedic-paan",
            image="tenants/vedic-paan/banners/clip.mp4",
            mediaType="video",
        )
        self.assertEqual(banner.title, "")
        self.assertEqual(banner.mediaType, "video")


if __name__ == "__main__":
    unittest.main()
