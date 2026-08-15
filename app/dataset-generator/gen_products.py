import json
import random
from faker import Faker
from datetime import datetime
import os

fake = Faker()
os.makedirs("output", exist_ok=True)
TENANTS = [
    {"tenantId": "TENANT001", "name": "ShopSphere"},
    {"tenantId": "TENANT002", "name": "MegaMart"},
    {"tenantId": "TENANT003", "name": "UrbanCart"},
]

CATEGORIES = [
    "Electronics",
    "Mobiles",
    "Laptops",
    "Women's Fashion",
    "Men's Fashion",
    "Kids Fashion",
    "Footwear",
    "Beauty",
    "Health",
    "Books",
    "Sports",
    "Furniture",
    "Home & Kitchen",
    "Groceries",
    "Pet Supplies",
    "Automotive",
    "Jewelry",
    "Watches",
    "Toys",
    "Accessories",
]

BRANDS = [
    "Apple",
    "Samsung",
    "Sony",
    "Nike",
    "Adidas",
    "Puma",
    "Dell",
    "HP",
    "Lenovo",
    "Boat",
    "LG",
    "OnePlus",
    "Realme",
    "Levi's",
    "H&M",
    "Zara",
]


def generate_product(tenant, category, index):

    price = random.randint(500, 100000)

    discount = random.randint(5, 50)

    final_price = round(price - (price * discount / 100), 2)

    product = {
        "tenantId": tenant["tenantId"],
        "name": f"{random.choice(BRANDS)} {fake.word().title()} {category}",
        "description": fake.text(max_nb_chars=150),
        "categoryId": category.replace(" ", "_").upper(),
        "price": price,
        "discountPercentage": discount,
        "finalPrice": final_price,
        "stock": random.randint(10, 500),
        "sizes": random.sample(
            ["XS", "S", "M", "L", "XL", "XXL"], random.randint(0, 4)
        ),
        "colors": random.sample(
            ["Black", "White", "Blue", "Red", "Green", "Yellow", "Pink", "Grey"],
            random.randint(1, 4),
        ),
        "images": [
            f"https://picsum.photos/600/600?random={random.randint(1,10000)}",
            f"https://picsum.photos/600/600?random={random.randint(10001,20000)}",
        ],
        "isActive": True,
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "averageRating": round(random.uniform(1, 5), 1),
        "reviewCount": random.randint(0, 500),
    }

    return product


products = []

for tenant in TENANTS:
    for category in CATEGORIES:
        for i in range(100):
            products.append(generate_product(tenant, category, i))

# Save once
os.makedirs("output", exist_ok=True)

with open("output/products.json", "w", encoding="utf-8") as file:
    json.dump(products, file, indent=4, ensure_ascii=False)

print(f"{len(products)} products generated successfully.")
