from pymongo import MongoClient
from dotenv import load_dotenv
import os
import json
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME")
print(DATABASE_NAME, MONGO_URI)
client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
# with open("output/products.json", encoding="utf-8") as f:
#     products = json.load(f)
# db.products.delete_many({})  # Optional: clear existing data
# db.products.insert_many(products)
# try:
#     client.admin.command("ping")
#     print("✅ Connected to MongoDB Atlas")
# except Exception as e:
#     print("❌ Connection failed:", e)
users = db["users"]
products = db["products"]
categories = db["categories"]
carts = db["carts"]
wishlists = db["wishlists"]
addresses = db["addresses"]
orders = db["orders"]
reviews = db["reviews"]
coupons = db["coupons"]
banners = db["banners"]
tenants = db["tenants"]
payment_intents = db["payment_intents"]
