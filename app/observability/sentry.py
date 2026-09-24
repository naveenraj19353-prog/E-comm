"""Sentry error tracking. A complete no-op while SENTRY_DSN is empty."""

from __future__ import annotations

import logging

from app.observability import settings
from app.observability.context import get_request_id, get_tenant_id
from app.observability.scrubbing import scrub_event

logger = logging.getLogger(__name__)

# Logger used by alert(); Sentry's logging integration ignores it because
# alert() sends its own, better-tagged Sentry message.
ALERT_LOGGER_NAME = "app.alerts"

_enabled = False


def is_enabled() -> bool:
    return _enabled


def before_send(event: dict, hint: dict | None = None) -> dict | None:
    """Tag with request/tenant and strip secrets before anything is sent."""
    tags = event.get("tags")
    if not isinstance(tags, dict):
        # Sentry may send tags as [[key, value], ...]; normalise to a dict.
        tags = dict(tags) if isinstance(tags, list) else {}
    request_id = get_request_id()
    tenant_id = get_tenant_id()
    if request_id and "request_id" not in tags:
        tags["request_id"] = request_id
    if tenant_id and "tenant_id" not in tags:
        tags["tenant_id"] = tenant_id
    event["tags"] = tags
    return scrub_event(event)


def init_sentry(
    dsn: str | None = None,
    *,
    environment: str | None = None,
    release: str | None = None,
    traces_sample_rate: float | None = None,
) -> bool:
    """Initialise the SDK with FastAPI integration. Returns whether it is on."""
    global _enabled
    dsn = settings.SENTRY_DSN if dsn is None else dsn
    if not dsn:
        _enabled = False
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration, ignore_logger
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; Sentry disabled.")
        _enabled = False
        return False

    rate = settings.SENTRY_TRACES_SAMPLE_RATE if traces_sample_rate is None else traces_sample_rate
    denylist = DEFAULT_DENYLIST + [
        "otp",
        "signature",
        "x_razorpay_signature",
        "razorpay_signature",
        "x_periskope_signature",
        "resettoken",
        "apitoken",
        "newpassword",
    ]
    sentry_sdk.init(
        dsn=dsn,
        environment=environment or settings.SENTRY_ENVIRONMENT,
        release=release if release is not None else settings.SENTRY_RELEASE,
        traces_sample_rate=rate,
        send_default_pii=False,
        # Request bodies carry customer PII, passwords and webhook payloads.
        max_request_body_size="never",
        event_scrubber=EventScrubber(denylist=denylist, recursive=True),
        before_send=before_send,
        before_send_transaction=before_send,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
    )
    ignore_logger(ALERT_LOGGER_NAME)
    ignore_logger("app.access")
    _enabled = True
    logger.info("Sentry enabled (environment=%s).", environment or settings.SENTRY_ENVIRONMENT)
    return True
