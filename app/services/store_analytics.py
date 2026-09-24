"""Per-store analytics ids (GA4 measurement id, Meta Pixel id).

Both are optional. They are validated on write and again on read, so a bad
value that somehow reached the database is never handed to the storefront,
which builds script URLs from them.
"""

from __future__ import annotations

import re
from typing import Any

GA4_MEASUREMENT_ID_RE = re.compile(r"^G-[A-Z0-9]{4,16}$")
META_PIXEL_ID_RE = re.compile(r"^[0-9]{5,20}$")

GA4_ERROR = "GA4 measurement ID must look like G-XXXXXXXXXX."
META_PIXEL_ERROR = "Meta Pixel ID must be the numeric ID from Events Manager."


def normalize_ga4_measurement_id(value: object) -> str | None:
    """Return the upper-cased id, None when empty; raise ValueError if invalid."""
    if value is None:
        return None
    cleaned = str(value).strip().upper()
    if not cleaned:
        return None
    if not GA4_MEASUREMENT_ID_RE.fullmatch(cleaned):
        raise ValueError(GA4_ERROR)
    return cleaned


def normalize_meta_pixel_id(value: object) -> str | None:
    """Return the digits-only id, None when empty; raise ValueError if invalid."""
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if not META_PIXEL_ID_RE.fullmatch(cleaned):
        raise ValueError(META_PIXEL_ERROR)
    return cleaned


def normalize_store_analytics(value: object) -> dict[str, str | None]:
    """Validate a full analytics sub-document for storage (raises ValueError)."""
    data = value if isinstance(value, dict) else {}
    return {
        "ga4MeasurementId": normalize_ga4_measurement_id(data.get("ga4MeasurementId")),
        "metaPixelId": normalize_meta_pixel_id(data.get("metaPixelId")),
    }


def public_store_analytics(tenant: dict[str, Any] | None) -> dict[str, str | None]:
    """Analytics ids safe to send to the storefront; invalid values become None."""
    raw = (tenant or {}).get("analytics")
    raw = raw if isinstance(raw, dict) else {}
    result: dict[str, str | None] = {"ga4MeasurementId": None, "metaPixelId": None}
    try:
        result["ga4MeasurementId"] = normalize_ga4_measurement_id(raw.get("ga4MeasurementId"))
    except ValueError:
        pass
    try:
        result["metaPixelId"] = normalize_meta_pixel_id(raw.get("metaPixelId"))
    except ValueError:
        pass
    return result
