import os
import sys
from datetime import datetime, timezone
# ============================================================
# PROJECT ROOT
# ============================================================
PROJECT_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "../..",
    )
)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from app.database.mongo import categories
# ============================================================
# TENANTS
# ============================================================
TENANTS = [
    {
        "tenantId": "shopsphere",
        "type": "fashion",
    },
    {
        "tenantId": "megamart",
        "type": "electronics",
    },
    {
        "tenantId": "urbancart",
        "type": "grocery",
    },
    {
        "tenantId": "foodhub",
        "type": "food",
    },
    {
        "tenantId": "homenest",
        "type": "home",
    },
]
# ============================================================
# CATEGORIES
# EXACTLY MATCHES gen_products.py
# ============================================================
TENANT_CATEGORIES = {
    "fashion": [
        "Women's Fashion",
        "Men's Fashion",
        "Kids Fashion",
        "Footwear",
        "Watches",
        "Jewelry",
        "Beauty",
        "Accessories",
    ],
    "electronics": [
        "Mobiles",
        "Laptops",
        "Televisions",
        "Headphones",
        "Cameras",
        "Smart Watches",
        "Speakers",
        "Gaming",
    ],
    "grocery": [
        "Fruits",
        "Vegetables",
        "Dairy",
        "Bakery",
        "Beverages",
        "Snacks",
        "Staples",
        "Personal Care",
    ],
    "food": [
        "Biryani",
        "Pizza",
        "Burgers",
        "South Indian",
        "North Indian",
        "Chinese",
        "Desserts",
        "Beverages",
    ],
    "home": [
        "Furniture",
        "Home Decor",
        "Kitchen",
        "Bedding",
        "Lighting",
        "Storage",
        "Bath",
        "Garden",
    ],
}
# ============================================================
# CATEGORY IMAGES
# ============================================================
CATEGORY_IMAGES = {
    "Women's Fashion":
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=600&fit=crop",
    "Men's Fashion":
        "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?w=600&h=600&fit=crop",
    "Kids Fashion":
        "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=600&h=600&fit=crop",
    "Footwear":
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop",
    "Watches":
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&h=600&fit=crop",
    "Jewelry":
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&h=600&fit=crop",
    "Beauty":
        "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
    "Accessories":
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
    "Mobiles":
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=600&fit=crop",
    "Laptops":
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=600&fit=crop",
    "Televisions":
        "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&h=600&fit=crop",
    "Headphones":
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop",
    "Cameras":
        "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=600&fit=crop",
    "Smart Watches":
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop",
    "Speakers":
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=600&fit=crop",
    "Gaming":
        "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&h=600&fit=crop",
    "Fruits":
        "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&h=600&fit=crop",
    "Vegetables":
        "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop",
    "Dairy":
        "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=600&h=600&fit=crop",
    "Bakery":
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop",
    "Beverages":
        "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=600&fit=crop",
    "Snacks":
        "https://images.unsplash.com/photo-1621939514649-280e2aa1ef71?w=600&h=600&fit=crop",
    "Staples":
        "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&h=600&fit=crop",
    "Personal Care":
        "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=600&fit=crop",
    "Biryani":
        "https://images.unsplash.com/photo-1563379091339-03246963d96c?w=600&h=600&fit=crop",
    "Pizza":
        "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=600&fit=crop",
    "Burgers":
        "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop",
    "South Indian":
        "https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&h=600&fit=crop",
    "North Indian":
        "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=600&fit=crop",
    "Chinese":
        "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&h=600&fit=crop",
    "Desserts":
        "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=600&fit=crop",
    "Furniture":
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop",
    "Home Decor":
        "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&h=600&fit=crop",
    "Kitchen":
        "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&h=600&fit=crop",
    "Bedding":
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&h=600&fit=crop",
    "Lighting":
        "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&h=600&fit=crop",
    "Storage":
        "https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=600&h=600&fit=crop",
    "Bath":
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&h=600&fit=crop",
    "Garden":
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=600&fit=crop",
}
# ============================================================
# CATEGORY ID
# SAME AS gen_products.py
# ============================================================
def get_category_id(category):
    return (
        category
        .replace(" ", "_")
        .replace("&", "AND")
        .replace("'", "")
        .upper()
    )
# ============================================================
# CREATE / UPDATE CATEGORY
# ============================================================
def create_or_update_category(
    tenant_id,
    category_name,
):
    category_id = get_category_id(category_name)
    image_url = CATEGORY_IMAGES.get(category_name)
    if not image_url:
        print(
            f"❌ Missing image: {category_name}"
        )
        return
    now = datetime.now(timezone.utc)
    result = categories.update_one(
        {
            "tenantId": tenant_id,
            "categoryId": category_id,
        },
        {
            "$set": {
                "tenantId": tenant_id,
                "categoryId": category_id,
                "name": category_name,
                "image": image_url,
                "isActive": True,
                "updatedAt": now,
            },
            "$setOnInsert": {
                "createdAt": now,
            },
        },
        upsert=True,
    )
    if result.upserted_id:
        print(
            f"  ✅ CREATED  | "
            f"{category_name}"
        )
    elif result.modified_count:
        print(
            f"  🔄 UPDATED  | "
            f"{category_name}"
        )
    else:
        print(
            f"  ✓ EXISTS   | "
            f"{category_name}"
        )
# ============================================================
# MAIN
# ============================================================
def main():
    print()
    print("=" * 70)
    print("CREATE / UPDATE CATEGORIES")
    print("=" * 70)
    total = 0
    for tenant in TENANTS:
        tenant_id = tenant["tenantId"]
        tenant_type = tenant["type"]
        print()
        print(
            f"Tenant: {tenant_id}"
        )
        print("-" * 70)
        category_list = TENANT_CATEGORIES[
            tenant_type
        ]
        for category_name in category_list:
            create_or_update_category(
                tenant_id=tenant_id,
                category_name=category_name,
            )
            total += 1
    print()
    print("=" * 70)
    print(
        f"Completed: {total} category assignments"
    )
    print("=" * 70)
# ============================================================
# RUN
# ============================================================
if __name__ == "__main__":
    main()
