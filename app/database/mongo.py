import os

import certifi
from pymongo import MongoClient
from pymongo.server_api import ServerApi

from app.config import DATABASE_NAME, MONGO_URI, validate_required_settings

validate_required_settings()

# Python 3.14 on some Windows setups fails Atlas TLS with the system CA store.
# Prefer certifi; optionally allow insecure TLS for local/dev via env.
_MONGO_TLS_INSECURE = (
    (os.getenv("MONGO_TLS_INSECURE") or "").strip().lower()
    in {"1", "true", "yes", "on"}
)
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())


def _mongo_client_kwargs(uri: str) -> dict:
    options: dict = {
        "serverSelectionTimeoutMS": 15000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 20000,
        "retryWrites": True,
        # Keep BSON UTC datetimes timezone-aware when reading them back.
        "tz_aware": True,
    }
    if uri.startswith("mongodb+srv://") or "tls=true" in uri.lower():
        options["tlsCAFile"] = certifi.where()
        options["server_api"] = ServerApi("1")
        if _MONGO_TLS_INSECURE:
            options["tlsAllowInvalidCertificates"] = True
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
contact_messages = db["contact_messages"]
store_signup_otps = db["store_signup_otps"]
customer_otps = db["customer_otps"]
banners = db["banners"]
payment_intents = db["payment_intents"]
shipping_integrations = db["shipping_integrations"]
shipping_locations = db["shipping_locations"]
shipments = db["shipments"]
menu_daily_passwords = db["menu_daily_passwords"]
messaging_integrations = db["messaging_integrations"]
notification_logs = db["notification_logs"]
periskope_webhook_events = db["periskope_webhook_events"]
rate_limits = db["rate_limits"]
ledger_entries = db["ledger_entries"]
payouts = db["payouts"]
counters = db["counters"]
stock_movements = db["stock_movements"]
inventory_receivings = db["inventory_receivings"]
