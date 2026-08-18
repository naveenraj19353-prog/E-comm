from datetime import datetime

from app.database.mongo import categories


CATEGORY_IMAGES = {
    "ELECTRONICS": "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&h=600&fit=crop",
    "MOBILES": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=600&fit=crop",
    "LAPTOPS": "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=600&fit=crop",
    "WOMEN'S_FASHION": "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=600&fit=crop",
    "MEN'S_FASHION": "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?w=600&h=600&fit=crop",
    "KIDS_FASHION": "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=600&h=600&fit=crop",
    "FOOTWEAR": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop",
    "BEAUTY": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
    "HEALTH": "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=600&h=600&fit=crop",
    "BOOKS": "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&h=600&fit=crop",
    "SPORTS": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&h=600&fit=crop",
    "FURNITURE": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop",
    "HOME_&_KITCHEN": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&h=600&fit=crop",
    "GROCERIES": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop",
    "PET_SUPPLIES": "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&h=600&fit=crop",
    "AUTOMOTIVE": "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&h=600&fit=crop",
    "JEWELRY": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&h=600&fit=crop",
    "WATCHES": "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&h=600&fit=crop",
    "TOYS": "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&h=600&fit=crop",
    "ACCESSORIES": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
}


TENANT_ID = "TENANT001"


for category_name, image_url in CATEGORY_IMAGES.items():

    result = categories.update_one(
        {
            "tenantId": TENANT_ID,
            "name": category_name,
        },
        {
            "$set": {
                "image": image_url,
                "updatedAt": datetime.utcnow(),
            }
        },
    )

    print(
        f"{category_name}: "
        f"matched={result.matched_count}, "
        f"modified={result.modified_count}"
    )


print("Category image update completed.")