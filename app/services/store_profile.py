"""Validation for store profile fields shown on the storefront: business
details / GSTIN (REQ-011) and social media links (INT-013).

Values are validated before they are saved, because they are rendered on
public pages (links open in the shopper's browser).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Indian GSTIN: 2-digit state code, 10-character PAN, entity number, "Z", checksum.
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

# Each platform's link must point at one of its own domains (or a subdomain).
SOCIAL_LINK_HOSTS: dict[str, tuple[str, ...]] = {
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "x": ("x.com", "twitter.com"),
    "linkedin": ("linkedin.com",),
    "youtube": ("youtube.com", "youtu.be"),
}
SOCIAL_LINK_LABELS = {
    "facebook": "Facebook",
    "instagram": "Instagram",
    "x": "X (Twitter)",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
}
MAX_SOCIAL_LINK_LENGTH = 300


def normalize_gstin(value: object) -> str | None:
    """Upper-cased GSTIN, None for empty; raises ValueError if the format is wrong."""
    text = re.sub(r"\s+", "", str(value or "")).upper()
    if not text:
        return None
    if not GSTIN_PATTERN.match(text):
        raise ValueError("GSTIN must be 15 characters, for example 29ABCDE1234F1Z5.")
    return text


def normalize_social_link(platform: str, value: object) -> str | None:
    """An https link on the platform's own domain, None for empty; raises ValueError otherwise."""
    text = str(value or "").strip()
    if not text:
        return None
    label = SOCIAL_LINK_LABELS[platform]
    hosts = SOCIAL_LINK_HOSTS[platform]
    message = f"{label} link must be an https:// link on {hosts[0]}."
    if len(text) > MAX_SOCIAL_LINK_LENGTH:
        raise ValueError(message)
    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        raise ValueError(message)
    if not any(host == allowed or host.endswith(f".{allowed}") for allowed in hosts):
        raise ValueError(message)
    return text
