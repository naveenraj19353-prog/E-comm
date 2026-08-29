import certifi
from pymongo import MongoClient

from app.config import DATABASE_NAME, MONGO_URI, validate_required_settings

validate_required_settings()

client = MongoClient(
    MONGO_URI,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=10000,
)
db = client[DATABASE_NAME]

users = db["users"]
products = db["products"]
categories = db["categories"]
carts = db["carts"]
wishlists = db["wishlists"]
addresses = db["addresses"]
coupons = db["coupons"]
orders = db["orders"]
reviews = db["reviews"]
tenants = db["tenants"]
banners = db["banners"]
payment_intents = db["payment_intents"]
