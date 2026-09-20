import unittest

from app.routes.product import (
    _add_inventory_filter,
    _add_search_inventory_filter,
)


class ProductInventoryFilterTests(unittest.TestCase):
    def test_list_query_includes_out_of_stock_when_no_variant_filters(self):
        query: dict = {}
        _add_inventory_filter(query, [], [])
        self.assertNotIn("inventory", query)

    def test_list_query_matches_color_without_requiring_stock(self):
        query: dict = {}
        _add_inventory_filter(query, [], ["Red"])
        self.assertIn("inventory", query)
        match = query["inventory"]["$elemMatch"]["$and"]
        self.assertFalse(any("stock" in item for item in match))

    def test_search_query_includes_out_of_stock_when_no_variant_filters(self):
        query: dict = {}
        _add_search_inventory_filter(query, [], [])
        self.assertNotIn("inventory", query)


if __name__ == "__main__":
    unittest.main()
