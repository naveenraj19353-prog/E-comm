"""Environment settings for logging, Sentry and metrics.

Read here (not in app/config.py) so observability can be configured before
the rest of the app is imported, and so this module owns its own knobs.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().strip('"').strip("'")


def _float(name: str, default: float, low: float = 0.0, high: float = 1.0) -> float:
    try:
        value = float(_env(name) or default)
    except ValueError:
        return default
    return min(high, max(low, value))


def _int(name: str, default: int, low: int = 0) -> int:
    try:
        return max(low, int(_env(name) or default))
    except ValueError:
        return default


ENVIRONMENT = (_env("ENVIRONMENT") or "development").lower()

# Logging: "text" (readable, default) or "json" (one object per line).
LOG_FORMAT = (_env("LOG_FORMAT") or "text").lower()
LOG_LEVEL = (_env("LOG_LEVEL") or "INFO").upper()

# Sentry. Everything is a no-op while SENTRY_DSN is empty.
SENTRY_DSN = _env("SENTRY_DSN")
SENTRY_ENVIRONMENT = _env("SENTRY_ENVIRONMENT") or ENVIRONMENT
SENTRY_TRACES_SAMPLE_RATE = _float("SENTRY_TRACES_SAMPLE_RATE", 0.1)
# Release: explicit, else the commit id common hosts inject.
SENTRY_RELEASE = (
    _env("SENTRY_RELEASE")
    or _env("RENDER_GIT_COMMIT")
    or _env("GIT_COMMIT")
    or None
)

# GET /metrics is disabled (404) until a token is set.
METRICS_TOKEN = _env("METRICS_TOKEN")
# Distinct stores that get their own metrics label; the rest share "other".
METRICS_MAX_TENANTS = _int("METRICS_MAX_TENANTS", 100, low=1)
