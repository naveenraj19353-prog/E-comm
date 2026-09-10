import os
from dotenv import load_dotenv

load_dotenv()


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

EMAIL = os.getenv("EMAIL")
APP_PASSWORD = os.getenv("APP_PASSWORD")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

_default_cors = "http://localhost:5173,http://127.0.0.1:5173"
CORS_ORIGINS = _split_csv(os.getenv("CORS_ORIGINS", _default_cors))

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

S3_BUCKET = _env("S3_BUCKET") or "multi-tenant-ecomm-images-prod"
S3_REGION = _env("S3_REGION") or "eu-north-1"
AWS_ACCESS_KEY_ID = _env("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = _env("AWS_SECRET_ACCESS_KEY")

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
