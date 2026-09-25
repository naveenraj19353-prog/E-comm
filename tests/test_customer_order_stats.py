import unittest
from datetime import datetime, timezone

from bson import ObjectId

from app.services.customer_order_stats import (
    empty_stats,
    order_stats_pipeline,
    stats_by_user,
    user_id_values,
)


class CustomerOrderStatsTests(unittest.TestCase):
    def test_matches_string_and_object_ids(self):
        user_id = ObjectId()
        self.assertEqual(user_id_values([user_id]), [str(user_id), user_id])
        self.assertEqual(user_id_values(["guest-1"]), ["guest-1"])

    def test_pipeline_scopes_to_store_and_skips_cancelled(self):
        user_id = ObjectId()
        match = order_stats_pipeline("store-a", [user_id])[0]["$match"]
        self.assertEqual(match["tenantId"], "store-a")
        self.assertEqual(match["orderStatus"], {"$nin": ["cancelled"]})
        self.assertIn(user_id, match["userId"]["$in"])

    def test_rows_become_stats_keyed_by_string_id(self):
        user_id = ObjectId()
        when = datetime(2026, 9, 20, 10, 0, tzinfo=timezone.utc)
        rows = [{"_id": str(user_id), "orderCount": 3, "totalSpent": 2499.999, "lastOrderAt": when}]
        stats = stats_by_user(rows)
        self.assertEqual(
            stats[str(user_id)],
            {"orderCount": 3, "totalSpent": 2500.0, "lastOrderAt": when.isoformat()},
        )

    def test_empty_stats(self):
        self.assertEqual(empty_stats(), {"orderCount": 0, "totalSpent": 0.0, "lastOrderAt": None})


if __name__ == "__main__":
    unittest.main()
