import os
import re
from dotenv import load_dotenv

load_dotenv()


def tenant_subdomain_cors_regex(domain: str) -> str:
    """One HTTPS label under the storefront domain, e.g. https://vedic-paan.retailcosmos.com."""
    escaped = re.escape((domain or "retailcosmos.com").strip().lower())
    return rf"^https://[a-zA-Z0-9-]+\.{escaped}$"


def resolve_cors_origin_regex(
    domain: str, env_regex: str | None = None
) -> str:
    """Use a custom regex only when it is fully anchored; otherwise use the tenant pattern."""
    custom = (env_regex or "").strip()
    if custom.startswith("^") and custom.endswith("$"):
        return custom
    return tenant_subdomain_cors_regex(domain)


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    return value.strip().strip('"').strip("'")


MONGO_URI = _env("MONGO_URI")
DATABASE_NAME = _env("DATABASE_NAME")

SECRET_KEY = os.getenv("SECRET_KEY")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

PERISKOPE_API_KEY = _env("PERISKOPE_API_KEY")
PERISKOPE_PHONE = _env("PERISKOPE_PHONE")
PERISKOPE_BASE_URL = (
    _env("PERISKOPE_BASE_URL") or "https://api.periskope.app/v1"
).rstrip("/")
PERISKOPE_WEBHOOK_SIGNING_KEY = _env("PERISKOPE_WEBHOOK_SIGNING_KEY")
try:
    PERISKOPE_TIMEOUT_SECONDS = float(
        _env("PERISKOPE_TIMEOUT_SECONDS") or "10"
    )
except ValueError:
    PERISKOPE_TIMEOUT_SECONDS = 10.0
_periskope_verify_ssl = (_env("PERISKOPE_VERIFY_SSL") or "true").lower()

EMAIL = _env("EMAIL")
# Gmail app passwords are 16 characters; Google often copies them with spaces.
APP_PASSWORD = (_env("APP_PASSWORD") or "").replace(" ", "") or None

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Apex domain. Tenant storefronts use https://{slug}.retailcosmos.com.
ROOT_DOMAIN = (_env("ROOT_DOMAIN") or "retailcosmos.com").lower()
TENANT_BASE_DOMAIN = (
    _env("TENANT_BASE_DOMAIN") or ROOT_DOMAIN
).lower()
_tenant_subdomain = (_env("TENANT_SUBDOMAIN_ROUTING") or "auto").lower()
TENANT_SUBDOMAIN_ROUTING = _tenant_subdomain not in {"0", "false", "no", "off", "path"}

_required_cors_origins = [
    f"https://{ROOT_DOMAIN}",
    f"https://www.{ROOT_DOMAIN}",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_env_cors_origins = _split_csv(os.getenv("CORS_ORIGINS"))
CORS_ORIGINS = list(dict.fromkeys([*_required_cors_origins, *_env_cors_origins]))
CORS_ORIGIN_REGEX = resolve_cors_origin_regex(
    TENANT_BASE_DOMAIN, _env("CORS_ORIGIN_REGEX")
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"
PERISKOPE_VERIFY_SSL = (
    True
    if IS_PRODUCTION
    else _periskope_verify_ssl not in {"0", "false", "no", "off"}
)

S3_BUCKET = _env("S3_BUCKET") or "multi-tenant-ecomm-images-prod"
S3_REGION = _env("S3_REGION") or "eu-north-1"
AWS_ACCESS_KEY_ID = _env("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = _env("AWS_SECRET_ACCESS_KEY")

# Delhivery One — host only (no tenant tokens here).
# staging → staging-express; production/live → track.delhivery.com
DELHIVERY_ENV = (_env("DELHIVERY_ENV") or "staging").lower()
_DELHIVERY_HOSTS = {
    "staging": "https://staging-express.delhivery.com",
    "production": "https://track.delhivery.com",
    "live": "https://track.delhivery.com",
}
DELHIVERY_BASE_URL = (
    _env("DELHIVERY_BASE_URL")
    or _DELHIVERY_HOSTS.get(DELHIVERY_ENV)
    or _DELHIVERY_HOSTS["staging"]
).rstrip("/")
# Optional dedicated key for Fernet; falls back to SECRET_KEY-derived key.
TOKEN_ENCRYPTION_KEY = _env("TOKEN_ENCRYPTION_KEY")

# Local Windows sometimes fails CA verification (corporate proxy/AV).
# Keep true in production/EC2. Set S3_VERIFY_SSL=false only for local debugging.
_s3_verify = (_env("S3_VERIFY_SSL") or "true").lower()
S3_VERIFY_SSL = _s3_verify not in {"0", "false", "no", "off"}

try:
    S3_PRESIGNED_URL_EXPIRES = int(_env("S3_PRESIGNED_URL_EXPIRES") or "3600")
except ValueError:
    S3_PRESIGNED_URL_EXPIRES = 3600
if S3_PRESIGNED_URL_EXPIRES <= 0:
    S3_PRESIGNED_URL_EXPIRES = 3600

# Optional CDN (e.g. CloudFront with Origin Access Control) in front of the
# private image bucket. When set, image keys are returned as stable
# {CDN_BASE_URL}/tenants/... URLs instead of presigned S3 URLs.
CDN_BASE_URL = (_env("CDN_BASE_URL") or "").rstrip("/")

# Seconds to cache public storefront data (layout, home page, product lists)
# in each server process. 0 disables. Other processes see writes within this.
try:
    STOREFRONT_CACHE_SECONDS = max(0, int(_env("STOREFRONT_CACHE_SECONDS") or "60"))
except ValueError:
    STOREFRONT_CACHE_SECONDS = 60

# Reverse proxies in front of the API that append to X-Forwarded-For
# (Nginx on EC2 = 1). 0 trusts no header and uses the socket peer address.
try:
    TRUSTED_PROXY_HOPS = max(0, int(_env("TRUSTED_PROXY_HOPS") or "0"))
except ValueError:
    TRUSTED_PROXY_HOPS = 0

# Requests one store may make per minute, per server process (0 disables).
# A storefront page load is roughly 5-10 API calls, so 1200 is ~150 page
# views a minute for a single store on a single process.
try:
    STORE_REQUESTS_PER_MINUTE = max(0, int(_env("STORE_REQUESTS_PER_MINUTE") or "1200"))
except ValueError:
    STORE_REQUESTS_PER_MINUTE = 1200

# Platform commission on Razorpay-collected orders, used unless a store has its
# own negotiated rate (tenants.platformCommissionPercent).
try:
    PLATFORM_DEFAULT_COMMISSION_PERCENT = float(
        _env("PLATFORM_DEFAULT_COMMISSION_PERCENT") or "5"
    )
except ValueError:
    PLATFORM_DEFAULT_COMMISSION_PERCENT = 5.0

# Store subscription billing: new stores get TRIAL_MONTHS free, then are
# charged through a Razorpay Subscription Plan (create the ₹499/month plan
# once in the Razorpay dashboard and paste its plan_... id here). Stores that
# existed before billing launched have no `billing` field and stay free.
RAZORPAY_SUBSCRIPTION_PLAN_ID = _env("RAZORPAY_SUBSCRIPTION_PLAN_ID")
try:
    TRIAL_MONTHS = max(0, int(_env("TRIAL_MONTHS") or "3"))
except ValueError:
    TRIAL_MONTHS = 3
try:
    SUBSCRIPTION_GRACE_DAYS = max(0, int(_env("SUBSCRIPTION_GRACE_DAYS") or "7"))
except ValueError:
    SUBSCRIPTION_GRACE_DAYS = 7
try:
    # Display only — the amount actually charged is whatever the Razorpay Plan says.
    SUBSCRIPTION_PRICE_INR = float(_env("SUBSCRIPTION_PRICE_INR") or "499")
except ValueError:
    SUBSCRIPTION_PRICE_INR = 499.0

# Automatic Delhivery shipment status sync (app/services/shipment_sync.py).
# Minutes between sync runs across all processes (0 disables the loop).
try:
    SHIPMENT_SYNC_MINUTES = max(0, int(_env("SHIPMENT_SYNC_MINUTES") or "30"))
except ValueError:
    SHIPMENT_SYNC_MINUTES = 30
# Shipments tracked per run (oldest-checked first).
try:
    SHIPMENT_SYNC_BATCH_SIZE = max(1, min(int(_env("SHIPMENT_SYNC_BATCH_SIZE") or "100"), 1000))
except ValueError:
    SHIPMENT_SYNC_BATCH_SIZE = 100
# Shared secret Delhivery must send to POST /shipping/delhivery/webhook
# (empty = the webhook rejects everything).
DELHIVERY_WEBHOOK_TOKEN = _env("DELHIVERY_WEBHOOK_TOKEN") or ""


def validate_required_settings() -> None:
    missing = []
    if not MONGO_URI:
        missing.append("MONGO_URI")
    if not DATABASE_NAME:
        missing.append("DATABASE_NAME")
    if not SECRET_KEY:
        missing.append("SECRET_KEY")
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(f"Missing required environment variables: {joined}")
