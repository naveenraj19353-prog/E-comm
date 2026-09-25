import unittest

from app.routes.orders import ADMIN_STATUS_TRANSITIONS
from app.services import shipment_sync


class PackedStatusTests(unittest.TestCase):
    def test_packed_sits_between_processing_and_shipped(self):
        self.assertIn("packed", ADMIN_STATUS_TRANSITIONS["confirmed"])
        self.assertIn("packed", ADMIN_STATUS_TRANSITIONS["processing"])
        self.assertEqual(ADMIN_STATUS_TRANSITIONS["packed"], {"shipped", "cancelled"})

    def test_packed_orders_still_move_with_courier_updates(self):
        self.assertIn("packed", shipment_sync.SHIPPED_FROM)
        self.assertIn("packed", shipment_sync.DELIVERED_FROM)
        self.assertIn("packed", shipment_sync.EXCEPTION_ON)


if __name__ == "__main__":
    unittest.main()
