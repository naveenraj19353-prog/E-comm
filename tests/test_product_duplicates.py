from app.services.product_duplicates import categories_match, normalize_product_label


def test_normalize_collapses_case_and_spaces():
    assert normalize_product_label("  Paneer  Pizza ") == "paneer pizza"


def test_categories_match_by_id_or_name():
    product = {"categoryId": "menu-pizza", "categoryName": "Pizza"}
    assert categories_match(product, "MENU-PIZZA")
    assert categories_match(product, "pizza")
    assert not categories_match(product, "burgers")
