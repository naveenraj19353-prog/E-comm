"""alert(event, **context): the one call to make at an operational failure point.

It always logs at ERROR (logger "app.alerts", context as structured fields),
and when Sentry is on it also sends a Sentry message whose title is
"alert: <event>", tagged with `alert` = event plus tenant/request ids and any
short context values — so alert rules can match `alert:<event>` exactly.
Alerting never raises: a broken alert path must not break the caller.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar

from app.observability import sentry as sentry_state
from app.observability.context import clean_tenant, get_request_id, get_tenant_id
from app.observability.scrubbing import scrub

logger = logging.getLogger(sentry_state.ALERT_LOGGER_NAME)

# Context keys promoted to Sentry tags (searchable, usable in alert rules).
_TAG_KEYS = {
    "tenant_id",
    "provider",
    "operation",
    "status",
    "http_status",
    "code",
    "error_type",
    "event_type",
    "audience",
}
_MAX_TAG_LENGTH = 200

F = TypeVar("F", bound=Callable[..., Any])


def alert(event: str, **context: Any) -> None:
    try:
        _alert(event, context)
    except Exception:  # pragma: no cover - last-resort guard
        logging.getLogger(__name__).exception("alert(%s) itself failed", event)


def alert_on_error(event: str, **static_context: Any) -> Callable[[F], F]:
    """Decorator: alert(event, error=...) when the function raises, then re-raise.

    For wiring alerts into a function with one added line and no refactor.
    """

    def decorate(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any):
            try:
                return func(*args, **kwargs)
            except Exception as error:
                alert(event, error=error, function=func.__qualname__, **static_context)
                raise

        return wrapper  # type: ignore[return-value]

    return decorate


def _alert(event: str, context: dict[str, Any]) -> None:
    error = context.pop("error", None)
    if error is not None:
        context.setdefault("error_type", type(error).__name__)
        context.setdefault("error_message", str(error)[:500])
        # Provider errors (PeriskopeError, DelhiveryError) carry these.
        for attr, key in (("code", "code"), ("status_code", "http_status")):
            value = getattr(error, attr, None)
            if isinstance(value, (str, int)) and not isinstance(value, bool):
                context.setdefault(key, value)
    if "tenant_id" in context:
        context["tenant_id"] = clean_tenant(context["tenant_id"])
    safe = scrub({k: v for k, v in context.items() if v is not None})

    details = " ".join(f"{key}={value}" for key, value in sorted(safe.items()))
    logger.error(
        "ALERT %s%s",
        event,
        f" {details}" if details else "",
        extra={"alert": event, "alert_context": safe},
    )

    if not sentry_state.is_enabled():
        return
    import sentry_sdk

    with sentry_sdk.new_scope() as scope:
        scope.set_tag("alert", event)
        tenant = safe.get("tenant_id") or get_tenant_id()
        if tenant:
            scope.set_tag("tenant_id", tenant)
        request_id = get_request_id()
        if request_id:
            scope.set_tag("request_id", request_id)
        for key in _TAG_KEYS & safe.keys():
            if key != "tenant_id":
                scope.set_tag(key, str(safe[key])[:_MAX_TAG_LENGTH])
        scope.set_context("alert", safe)
        # One Sentry issue per alert type, however the details vary.
        scope.fingerprint = ["alert", event]
        sentry_sdk.capture_message(f"alert: {event}", level="error")
