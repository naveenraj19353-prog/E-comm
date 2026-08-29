import certifi
from pymongo import MongoClient

from app.config import DATABASE_NAME, MONGO_URI, validate_required_settings

validate_required_settings()


def _mongo_client_kwargs(uri: str) -> dict:
    options: dict = {
        "serverSelectionTimeoutMS": 10000,
        "retryWrites": True,
    }
    if uri.startswith("mongodb+srv://") or "tls=true" in uri.lower():
        options["tlsCAFile"] = certifi.where()
    return options


client = MongoClient(MONGO_URI, **_mongo_client_kwargs(MONGO_URI))
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
