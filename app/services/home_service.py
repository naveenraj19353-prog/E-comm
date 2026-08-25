from app.database.mongo import (
    products,
    categories,
    orders,
    banners,
)
from app.utils.product_serialize import serialize_product


def get_products_by_cursor(cursor):
    """Convert MongoDB cursor to a list."""
    data = []
    for product in cursor:
        data.append(serialize_product(product))
    return data
def get_home_data(
    tenant_id: str,
    product_limit: int = 10,
    category_limit: int = 12,
):
    """
    Generate all Home Page sections.
    Data comes from:
        products
        categories
        orders
        banners
    """
    # ========================================================
    # BASE PRODUCT QUERY
    # ========================================================
    base_query = {
        "tenantId": tenant_id,
        "isActive": True,
    }
    # ========================================================
    # 1. CATEGORIES
    # ========================================================
    category_cursor = (
        categories.find(
            {
                "tenantId": tenant_id,
                "isActive": True,
            }
        )
        .sort("createdAt", -1)
        .limit(category_limit)
    )
    category_data = []
    for category in category_cursor:
        category_data.append(
            {
                "id": str(category["_id"]),
                "name": category.get("name", ""),
                "description": category.get("description", ""),
                "image": category.get("image"),
            }
        )
    # ========================================================
    # 2. TRENDING PRODUCTS
    # ========================================================
    trending_cursor = (
        products.find(base_query)
        .sort(
            [
                ("reviewCount", -1),
                ("averageRating", -1),
            ]
        )
        .limit(product_limit)
    )
    trending_products = get_products_by_cursor(trending_cursor)
    # ========================================================
    # 3. BEST DISCOUNT
    # ========================================================
    discount_cursor = (
        products.find(base_query)
        .sort(
            [
                ("discountPercentage", -1),
                ("averageRating", -1),
            ]
        )
        .limit(product_limit)
    )
    best_discount_products = get_products_by_cursor(discount_cursor)
    # ========================================================
    # 4. NEW ARRIVALS
    # ========================================================
    new_arrivals_cursor = (
        products.find(base_query)
        .sort("createdAt", -1)
        .limit(product_limit)
    )
    new_arrivals = get_products_by_cursor(new_arrivals_cursor)
    # ========================================================
    # 5. TOP RATED
    # ========================================================
    top_rated_cursor = (
        products.find(
            {
                **base_query,
                "averageRating": {"$gt": 0},
            }
        )
        .sort(
            [
                ("averageRating", -1),
                ("reviewCount", -1),
            ]
        )
        .limit(product_limit)
    )
    top_rated_products = get_products_by_cursor(top_rated_cursor)
    # ========================================================
    # 6. DEAL OF THE DAY
    # ========================================================
    deal_cursor = (
        products.find(
            {
                **base_query,
                "discountPercentage": {"$gt": 0},
                "inventory": {
                    "$elemMatch": {
                        "stock": {"$gt": 0},
                    }
                },
            }
        )
        .sort(
            [
                ("discountPercentage", -1),
                ("averageRating", -1),
            ]
        )
        .limit(product_limit)
    )
    deal_of_the_day = get_products_by_cursor(deal_cursor)
    # ========================================================
    # 7. MOST SELLING PRODUCTS
    # ========================================================
    most_selling_products = []
    sales_pipeline = [
        {
            "$match": {
                "tenantId": tenant_id,
                "paymentStatus": "paid",
            }
        },
        {
            "$unwind": "$items",
        },
        {
            "$group": {
                "_id": "$items.productId",
                "totalSold": {
                    "$sum": "$items.quantity",
                },
                "orderCount": {
                    "$sum": 1,
                },
            }
        },
        {
            "$sort": {
                "totalSold": -1,
            }
        },
        {
            "$limit": product_limit,
        },
        {
            "$lookup": {
                "from": products.name,
                "localField": "_id",
                "foreignField": "_id",
                "as": "product",
            }
        },
        {
            "$unwind": "$product",
        },
        {
            "$match": {
                "product.tenantId": tenant_id,
                "product.isActive": True,
            }
        },
    ]
    sales_cursor = orders.aggregate(sales_pipeline)
    for item in sales_cursor:
        product = serialize_product(item["product"])
        product["totalSold"] = item.get(
            "totalSold",
            0,
        )
        product["orderCount"] = item.get(
            "orderCount",
            0,
        )
        most_selling_products.append(product)
    # ========================================================
    # 8. BRANDS
    # ========================================================
    brands = []
    # ========================================================
    # 9. BANNERS
    # ========================================================
    banner_cursor = (
        banners.find(
            {
                "tenantId": tenant_id,
                "isActive": True,
            }
        )
        .sort("priority", 1)
        .limit(10)
    )
    banner_data = []
    for banner in banner_cursor:
        banner["_id"] = str(banner["_id"])
        banner_data.append(banner)
    # ========================================================
    # FINAL RESPONSE
    # ========================================================
    return {
        "banners": banner_data,
        "categories": category_data,
        "trendingProducts": trending_products,
        "bestDiscountProducts": best_discount_products,
        "mostSellingProducts": most_selling_products,
        "newArrivals": new_arrivals,
        "topRatedProducts": top_rated_products,
        "dealOfTheDay": deal_of_the_day,
        "brands": brands,
    }
