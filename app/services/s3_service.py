from __future__ import annotations

from pathlib import Path
import logging
import re
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.config import (
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
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

ALLOWED_FOLDERS = {"products", "banners"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

_S3_KEY_PATTERN = re.compile(
    r"^tenants/(?P<tenant>[a-zA-Z0-9_-]+)/(?P<folder>products|banners)/(?P<filename>[^/\\]+)$"
)


def _s3_client():
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
    tenants/shopsphere/products/uuid.jpg
    """
    if folder not in ALLOWED_FOLDERS:
        raise ValueError(
            "Folder must be either 'products' or 'banners'."
        )

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError(
            "Unsupported image type. "
            "Allowed: JPEG, PNG, WEBP, GIF."
        )

    extension = Path(file.filename or "").suffix.lower()
    if not extension:
        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }.get(file.content_type, "")

    key = (
        f"tenants/"
        f"{tenant_id}/"
        f"{folder}/"
        f"{uuid.uuid4()}{extension}"
    )

    file_data = file.file.read()
    if len(file_data) > MAX_FILE_SIZE:
        raise ValueError("Image size must be 10 MB or less.")

    try:
        _s3_client().put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=file_data,
            ContentType=file.content_type,
        )
    except NoCredentialsError as error:
        raise _credentials_error(error) from error
    except (ClientError, BotoCoreError) as error:
        logger.exception("S3 upload failed for key %s", key)
        raise RuntimeError("Failed to upload image.") from error

    return {
        "key": key,
        "url": generate_presigned_url(key),
    }


def generate_presigned_url(
    s3_key: str,
    expiration: int | None = None,
) -> str:
    key = (s3_key or "").strip()
    if not key:
        return ""

    expires_in = expiration or S3_PRESIGNED_URL_EXPIRES
    try:
        return _s3_client().generate_presigned_url(
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
