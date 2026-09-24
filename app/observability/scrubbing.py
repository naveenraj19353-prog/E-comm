"""Remove secrets from data before it leaves the process (Sentry events, alerts).

Filters by key name (passwords, OTPs, tokens, signatures, auth headers,
cookies, API keys) at any depth, and masks secret-looking substrings in free
text (bearer tokens, JWTs, secret query parameters).
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlencode

FILTERED = "[Filtered]"

# Matched against the key with case and separators removed ("X-Razorpay-Signature"
# -> "xrazorpaysignature"), so any spelling is caught.
_SENSITIVE_SUBSTRINGS = (
    "password",
    "passwd",
    "secret",
    "token",
    "signature",
    "authorization",
    "cookie",
    "apikey",
    "privatekey",
    "credential",
    "cardnumber",
    "hmac",
)
# Short markers matched as whole words only ("signupOtp", "otp_code", but not
# "hotpink" or "notPaid").
_SENSITIVE_WORDS = {"otp", "cvv", "pwd", "sig", "auth", "session"}
# Whole keys that are secrets on their own.
_SENSITIVE_EXACT = {"key"}
# Keys that look sensitive but are not secrets.
_ALLOWED = {"tokentype"}

_BEARER_RE = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=\-]+")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")
_QUERY_SECRET_RE = re.compile(
    r"(?i)([?&;](?:[a-z_\-]*(?:token|password|secret|signature|otp|apikey|api_key)[a-z_\-]*|key|sig)=)[^&#\s\"']+"
)
_WORD_SPLIT_RE = re.compile(r"[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])")


def _normalise(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def is_sensitive_key(key: object) -> bool:
    if not isinstance(key, str):
        return False
    normalised = _normalise(key)
    if not normalised or normalised in _ALLOWED:
        return False
    if normalised in _SENSITIVE_EXACT:
        return True
    if any(part in normalised for part in _SENSITIVE_SUBSTRINGS):
        return True
    words = {word.lower() for word in _WORD_SPLIT_RE.findall(key)}
    return bool(words & _SENSITIVE_WORDS)


def scrub_text(value: str) -> str:
    value = _BEARER_RE.sub(lambda m: f"{m.group(1)} {FILTERED}", value)
    value = _JWT_RE.sub(FILTERED, value)
    value = _QUERY_SECRET_RE.sub(lambda m: f"{m.group(1)}{FILTERED}", value)
    return value


def scrub_query_string(query: str) -> str:
    if not query:
        return query
    pairs = parse_qsl(query, keep_blank_values=True)
    if not pairs:
        return scrub_text(query)
    return urlencode(
        [(k, FILTERED if is_sensitive_key(k) else scrub_text(v)) for k, v in pairs],
        safe="[]",
    )


def scrub(value: Any, _depth: int = 0) -> Any:
    """Return a scrubbed copy of dicts/lists/strings (other values unchanged)."""
    if _depth > 20:
        return value
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if is_sensitive_key(key) and item not in (None, "", [], {}):
                cleaned[key] = FILTERED
            else:
                cleaned[key] = scrub(item, _depth + 1)
        return cleaned
    if isinstance(value, (list, tuple)):
        items = [scrub(item, _depth + 1) for item in value]
        # Sentry sends headers as [[name, value], ...] pairs.
        items = [
            [item[0], FILTERED]
            if isinstance(item, list) and len(item) == 2 and is_sensitive_key(item[0])
            else item
            for item in items
        ]
        return items if isinstance(value, list) else tuple(items)
    if isinstance(value, str):
        return scrub_text(value)
    return value


def scrub_event(event: dict) -> dict:
    """Scrub a Sentry event in place-compatible form and return it."""
    event = scrub(event)
    request = event.get("request")
    if isinstance(request, dict):
        # Cookies can carry anything; never send them.
        if request.get("cookies"):
            request["cookies"] = FILTERED
        query = request.get("query_string")
        if isinstance(query, str):
            request["query_string"] = scrub_query_string(query)
        # Webhook and checkout bodies carry customer PII and signatures.
        if "data" in request and request["data"] not in (None, ""):
            request["data"] = FILTERED
    return event
