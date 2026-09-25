import unittest
from datetime import datetime, timezone

from bson import ObjectId

from app.services.order_search import (
    InvalidOrderFilter,
    build_order_filters,
    parse_order_number,
)


def no_customers(_tenant_id, _text):
    return []


class ParseOrderNumberTests(unittest.TestCase):
    def test_reference_with_prefix(self):
        self.assertEqual(parse_order_number("RC-10023"), 23)
        self.assertEqual(parse_order_number("rc-10023"), 23)

    def test_reference_without_prefix(self):
        self.assertEqual(parse_order_number("10023"), 23)

    def test_small_number_is_raw_order_number(self):
        self.assertEqual(parse_order_number("23"), 23)

    def test_text_is_not_an_order_number(self):
        self.assertIsNone(parse_order_number("Priya"))
        self.assertIsNone(parse_order_number("0"))


class BuildOrderFiltersTests(unittest.TestCase):
    def test_no_filters(self):
        self.assertEqual(build_order_filters("store-a", None, None, None, no_customers), {})
        self.assertEqual(build_order_filters("store-a", "   ", "", "", no_customers), {})

    def test_date_range_is_inclusive_utc_days(self):
        filters = build_order_filters("store-a", None, "2026-09-01", "2026-09-24", no_customers)
        self.assertEqual(
            filters["createdAt"],
            {
                "$gte": datetime(2026, 9, 1, tzinfo=timezone.utc),
                "$lt": datetime(2026, 9, 25, tzinfo=timezone.utc),
            },
        )

    def test_dates_use_the_admins_time_zone(self):
        filters = build_order_filters(
            "store-a", None, "2026-09-24", "2026-09-24", no_customers, tz_offset_minutes=330
        )
        self.assertEqual(
            filters["createdAt"],
            {
                "$gte": datetime(2026, 9, 23, 18, 30, tzinfo=timezone.utc),
                "$lt": datetime(2026, 9, 24, 18, 30, tzinfo=timezone.utc),
            },
        )

    def test_only_from_date(self):
        filters = build_order_filters("store-a", None, "2026-09-01", None, no_customers)
        self.assertEqual(filters["createdAt"], {"$gte": datetime(2026, 9, 1, tzinfo=timezone.utc)})

    def test_bad_dates_raise(self):
        with self.assertRaises(InvalidOrderFilter):
            build_order_filters("store-a", None, "01-09-2026", None, no_customers)
        with self.assertRaises(InvalidOrderFilter):
            build_order_filters("store-a", None, "2026-09-24", "2026-09-01", no_customers)
        with self.assertRaises(InvalidOrderFilter):
            build_order_filters("store-a", None, "2026-09-24", None, no_customers, tz_offset_minutes=5000)

    def test_order_reference_search(self):
        filters = build_order_filters("store-a", "RC-10023", None, None, no_customers)
        self.assertIn({"orderNumber": 23}, filters["$or"])

    def test_address_search_is_escaped_and_case_insensitive(self):
        filters = build_order_filters("store-a", "a.b+c", None, None, no_customers)
        self.assertIn({"address.fullName": {"$regex": r"a\.b\+c", "$options": "i"}}, filters["$or"])

    def test_customer_matches_include_string_and_object_ids(self):
        user_id = ObjectId()
        calls = []

        def find_customers(tenant_id, text):
            calls.append((tenant_id, text))
            return [user_id]

        filters = build_order_filters("store-a", "priya", None, None, find_customers)
        self.assertEqual(calls, [("store-a", "priya")])
        self.assertIn({"userId": {"$in": [str(user_id), user_id]}}, filters["$or"])

    def test_database_id_search(self):
        order_id = ObjectId()
        filters = build_order_filters("store-a", str(order_id), None, None, no_customers)
        self.assertIn({"_id": order_id}, filters["$or"])

    def test_search_is_trimmed_to_max_length(self):
        filters = build_order_filters("store-a", "x" * 500, None, None, no_customers)
        regex = filters["$or"][0]["address.fullName"]["$regex"]
        self.assertEqual(len(regex), 100)


if __name__ == "__main__":
    unittest.main()
