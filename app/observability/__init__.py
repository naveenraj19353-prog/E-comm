"""Observability: request ids, structured logs, Sentry, per-store metrics, alerts.

Wiring (see app/main.py):

    from app import observability
    observability.setup()                       # before FastAPI() is created
    app.add_middleware(observability.ObservabilityMiddleware)   # add last = outermost
    app.include_router(observability.metrics_router)

Elsewhere:

    from app.observability import alert
    alert("razorpay.webhook_failed", error=exc, razorpay_order_id=order_id)

Environment: LOG_FORMAT (text|json), LOG_LEVEL, SENTRY_DSN, SENTRY_ENVIRONMENT,
SENTRY_TRACES_SAMPLE_RATE, SENTRY_RELEASE, METRICS_TOKEN, METRICS_MAX_TENANTS.
"""

from __future__ import annotations

from app.observability import settings
from app.observability.alerts import alert, alert_on_error
from app.observability.context import REQUEST_ID_HEADER, get_request_id, get_tenant_id, set_tenant
from app.observability.logs import configure_logging
from app.observability.metrics import registry as metrics_registry
from app.observability.metrics import router as metrics_router
from app.observability.middleware import ObservabilityMiddleware
from app.observability.sentry import init_sentry, is_enabled as sentry_enabled

__all__ = [
    "REQUEST_ID_HEADER",
    "ObservabilityMiddleware",
    "alert",
    "alert_on_error",
    "configure_logging",
    "get_request_id",
    "get_tenant_id",
    "init_sentry",
    "metrics_registry",
    "metrics_router",
    "sentry_enabled",
    "set_tenant",
    "setup",
]

_configured = False


def setup() -> None:
    """Configure logging and (if SENTRY_DSN is set) Sentry. Safe to call twice."""
    global _configured
    if _configured:
        return
    configure_logging(settings.LOG_FORMAT, settings.LOG_LEVEL)
    init_sentry()
    _configured = True
