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
