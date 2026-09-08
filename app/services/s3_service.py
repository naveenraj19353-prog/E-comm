from pathlib import Path
import uuid

import boto3
from botocore.exceptions import ClientError


S3_BUCKET = "multi-tenant-ecomm-images"
S3_REGION = "eu-north-1"

s3_client = boto3.client(
    "s3",
    region_name=S3_REGION,
)


ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def upload_image(
    file,
    tenant_id: str,
    folder: str,
) -> str:
    """
    Upload an image to S3.

    Example:
    tenants/shopsphere/products/uuid.jpg
    tenants/shopsphere/banners/uuid.webp
    """

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError(
            "Unsupported image type. "
            "Allowed: JPEG, PNG, WEBP, GIF."
        )

    extension = Path(
        file.filename or ""
    ).suffix.lower()

    if not extension:
        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }.get(file.content_type, "")

    unique_name = f"{uuid.uuid4()}{extension}"

    key = (
        f"tenants/"
        f"{tenant_id}/"
        f"{folder}/"
        f"{unique_name}"
    )

    file_data = file.file.read()

    if len(file_data) > MAX_FILE_SIZE:
        raise ValueError(
            "Image size must be 10 MB or less."
        )

    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=file_data,
            ContentType=file.content_type,
        )

    except ClientError as e:
        raise RuntimeError(
            f"Failed to upload image to S3: {e}"
        )

    return (
        f"https://{S3_BUCKET}.s3."
        f"{S3_REGION}.amazonaws.com/{key}"
    )


def delete_image(s3_key: str) -> None:
    """
    Delete an image from S3 using its object key.
    """

    try:
        s3_client.delete_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
        )

    except ClientError as e:
        raise RuntimeError(
            f"Failed to delete image from S3: {e}"
        )