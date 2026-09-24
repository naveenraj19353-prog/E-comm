from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from urllib.parse import quote
import logging
import re
import threading
import time
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.config import (
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    CDN_BASE_URL,
    S3_BUCKET,
    S3_PRESIGNED_URL_EXPIRES,
    S3_REGION,
    S3_VERIFY_SSL,
)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/ogg",
}
CONTENT_TYPE_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogg": "video/ogg",
}

ALLOWED_FOLDERS = {"products", "banners", "branding"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50 MB

_S3_KEY_PATTERN = re.compile(
    r"^tenants/(?P<tenant>[a-zA-Z0-9_-]+)/(?P<folder>products|banners|branding)/(?P<filename>[^/\\]+)$"
)


_client = None
_client_lock = threading.Lock()


def _build_s3_client():
    if not S3_BUCKET or not S3_REGION:
        raise RuntimeError(
            "S3 is not configured. Set S3_BUCKET and S3_REGION in .env."
        )

    kwargs = {
        "region_name": S3_REGION,
        "verify": S3_VERIFY_SSL,
    }
    # Local optional credentials only. On EC2, leave empty so the IAM role is used.
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY

    if not S3_VERIFY_SSL:
        logger.warning(
            "S3 SSL verification is disabled (S3_VERIFY_SSL=false). "
            "Use only for local development."
        )

    return boto3.client("s3", **kwargs)


def _s3_client():
    """One shared client per process (boto3 clients are thread-safe and
    expensive to build; building one per image URL was a major cost)."""
    global _client
    client = _client
    if client is not None:
        return client
    with _client_lock:
        if _client is None:
            _client = _build_s3_client()
        return _client


def _credentials_error(error: Exception) -> RuntimeError:
    return RuntimeError(
        "AWS credentials are unavailable. "
        "On EC2 attach IAM role EC2-S3-Ecommerce-Role. "
        "For local development only, set AWS_ACCESS_KEY_ID and "
        "AWS_SECRET_ACCESS_KEY in .env."
    )


def is_s3_object_key(value: str) -> bool:
    return bool(_S3_KEY_PATTERN.match((value or "").strip()))


def validate_tenant_image_key(
    s3_key: str,
    tenant_id: str,
    folder: str = "products",
) -> str:
    key = (s3_key or "").strip()
    match = _S3_KEY_PATTERN.match(key)
    if not match:
        raise ValueError("Invalid image key.")

    if match.group("tenant") != tenant_id:
        raise ValueError("Invalid image key.")

    if match.group("folder") != folder:
        raise ValueError("Invalid image key.")

    filename = match.group("filename")
    if (
        not filename
        or filename in {".", ".."}
        or ".." in filename
    ):
        raise ValueError("Invalid image key.")

    return key


def collect_image_keys(images: dict | list | None) -> set[str]:
    keys: set[str] = set()
    if isinstance(images, list):
        values = images
    elif isinstance(images, dict):
        values = []
        for image_list in images.values():
            if isinstance(image_list, list):
                values.extend(image_list)
            elif isinstance(image_list, str):
                values.append(image_list)
    else:
        return keys

    for value in values:
        if isinstance(value, str) and is_s3_object_key(value.strip()):
            keys.add(value.strip())
    return keys


def upload_image(
    file,
    tenant_id: str,
    folder: str,
) -> dict[str, str]:
    """
    Upload an image to S3 and return object key + temporary URL.

    Example key:
    tenants/your-store/products/uuid.jpg
    """
    if folder not in ALLOWED_FOLDERS:
        raise ValueError(
            "Folder must be 'products', 'banners', or 'branding'."
        )

    extension = Path(file.filename or "").suffix.lower()
    content_type = str(file.content_type or "").split(";")[0].strip().lower()
    if not content_type or content_type == "application/octet-stream":
        content_type = CONTENT_TYPE_BY_EXTENSION.get(extension, content_type)

    allowed_types = set(ALLOWED_IMAGE_TYPES) | ALLOWED_VIDEO_TYPES
    if folder == "branding":
        allowed_types = set(ALLOWED_IMAGE_TYPES)
    if content_type not in allowed_types:
        if folder in {"banners", "products"}:
            raise ValueError(
                "Unsupported file. "
                "Allowed images: JPEG, PNG, WEBP, GIF. "
                "Allowed videos: MP4, WebM, MOV."
            )
        raise ValueError(
            "Unsupported image type. "
            "Allowed: JPEG, PNG, WEBP, GIF."
        )

    if not extension:
        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "video/quicktime": ".mov",
            "video/ogg": ".ogg",
        }.get(content_type, "")

    key = (
        f"tenants/"
        f"{tenant_id}/"
        f"{folder}/"
        f"{uuid.uuid4()}{extension}"
    )

    file_data = file.file.read()
    is_video = content_type in ALLOWED_VIDEO_TYPES
    max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
    if len(file_data) > max_size:
        limit_mb = 50 if is_video else 10
        raise ValueError(
            f"{'Video' if is_video else 'Image'} size must be {limit_mb} MB or less."
        )

    try:
        _s3_client().put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=file_data,
            ContentType=content_type or file.content_type,
        )
    except NoCredentialsError as error:
        raise _credentials_error(error) from error
    except (ClientError, BotoCoreError) as error:
        logger.exception("S3 upload failed for key %s", key)
        raise RuntimeError("Failed to upload image.") from error

    return {
        "key": key,
        "url": public_image_url(key),
    }


# ---------------------------------------------------------------------------
# Image URLs for responses
#
# CDN mode (CDN_BASE_URL set): stable {CDN_BASE_URL}/tenants/... URLs that
# browsers and the CDN can cache indefinitely (keys are immutable uuids).
#
# Presigned mode (fallback): each key's presigned URL is reused until only
# half of its lifetime is left, so the same image keeps the same URL for a
# while (browser-cacheable) instead of getting a new signature per request.
# Every URL handed out therefore stays valid for at least
# presigned_url_min_lifetime() seconds; response caches must be shorter.
# ---------------------------------------------------------------------------
_PRESIGNED_CACHE_MAX = 20000
_presigned_cache: OrderedDict[str, tuple[str, float]] = OrderedDict()
_presigned_lock = threading.Lock()


def presigned_url_min_lifetime() -> int:
    """Seconds a presigned URL returned by the cache is still valid, at least."""
    return max(S3_PRESIGNED_URL_EXPIRES // 2, 1)


def image_url_min_lifetime() -> int | None:
    """Minimum remaining validity of URLs from public_image_url (None = never expire)."""
    if CDN_BASE_URL:
        return None
    return presigned_url_min_lifetime()


def _credential_expiry(client) -> float | None:
    """Presigned URLs die with temporary (IAM role) credentials; find when."""
    try:
        credentials = getattr(
            getattr(client, "_request_signer", None), "_credentials", None
        )
        expiry = getattr(credentials, "_expiry_time", None)
        if expiry is None:
            return None
        return float(expiry.timestamp())
    except Exception:
        return None


def _sign_url(key: str, expires_in: int) -> tuple[str, float]:
    client = _s3_client()
    now = time.time()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key,
            },
            ExpiresIn=expires_in,
        )
    except NoCredentialsError as error:
        raise _credentials_error(error) from error
    except (ClientError, BotoCoreError) as error:
        logger.exception("Failed to generate presigned URL for %s", key)
        raise RuntimeError("Failed to generate image URL.") from error
    expires_at = now + expires_in
    credential_expiry = _credential_expiry(client)
    if credential_expiry is not None:
        expires_at = min(expires_at, credential_expiry)
    return url, expires_at


def generate_presigned_url(
    s3_key: str,
    expiration: int | None = None,
) -> str:
    key = (s3_key or "").strip()
    if not key:
        return ""

    if expiration and expiration != S3_PRESIGNED_URL_EXPIRES:
        # Explicit custom lifetime: always a fresh signature.
        return _sign_url(key, expiration)[0]

    min_remaining = presigned_url_min_lifetime()
    now = time.time()
    with _presigned_lock:
        cached = _presigned_cache.get(key)
        if cached is not None and cached[1] - now >= min_remaining:
            _presigned_cache.move_to_end(key)
            return cached[0]

    url, expires_at = _sign_url(key, S3_PRESIGNED_URL_EXPIRES)
    if expires_at - now >= min_remaining:
        with _presigned_lock:
            _presigned_cache[key] = (url, expires_at)
            _presigned_cache.move_to_end(key)
            while len(_presigned_cache) > _PRESIGNED_CACHE_MAX:
                _presigned_cache.popitem(last=False)
    return url


def cdn_url(s3_key: str) -> str:
    return f"{CDN_BASE_URL}/{quote(s3_key, safe='/')}"


def public_image_url(s3_key: str) -> str:
    """URL for an image key in API responses: CDN if configured, else presigned."""
    key = (s3_key or "").strip()
    if not key:
        return ""
    if CDN_BASE_URL and is_s3_object_key(key):
        return cdn_url(key)
    return generate_presigned_url(key)


def _forget_presigned_url(key: str) -> None:
    with _presigned_lock:
        _presigned_cache.pop(key, None)


def get_object_bytes(s3_key: str) -> tuple[bytes, str]:
    """Fetch raw object bytes + content type for stable OG image responses."""
    key = (s3_key or "").strip()
    if not key:
        raise RuntimeError("Missing image key.")

    try:
        response = _s3_client().get_object(
            Bucket=S3_BUCKET,
            Key=key,
        )
        body = response["Body"].read()
        content_type = str(response.get("ContentType") or "image/jpeg")
        return body, content_type
    except NoCredentialsError as error:
        raise _credentials_error(error) from error
    except (ClientError, BotoCoreError) as error:
        logger.exception("Failed to read S3 object %s", key)
        raise RuntimeError("Failed to load image.") from error


def delete_image(s3_key: str) -> None:
    """Delete an image from S3 using its object key."""
    key = (s3_key or "").strip()
    if not key:
        return

    _forget_presigned_url(key)
    try:
        _s3_client().delete_object(
            Bucket=S3_BUCKET,
            Key=key,
        )
    except NoCredentialsError as error:
        raise _credentials_error(error) from error
    except (ClientError, BotoCoreError) as error:
        logger.exception("S3 delete failed for key %s", key)
        raise RuntimeError("Failed to delete image.") from error


def delete_tenant_image_keys(
    s3_keys: set[str] | list[str],
    tenant_id: str,
    folder: str = "products",
) -> None:
    """
    Delete only S3 keys that belong to the given tenant/folder.
    Invalid/foreign keys are skipped.
    """
    for raw_key in s3_keys:
        try:
            key = validate_tenant_image_key(raw_key, tenant_id, folder)
        except ValueError:
            continue
        try:
            delete_image(key)
        except RuntimeError:
            logger.exception(
                "Failed deleting unused image key %s for tenant %s",
                key,
                tenant_id,
            )
