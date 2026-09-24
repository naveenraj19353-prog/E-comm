"""Per-request context (request id, tenant) shared by logs, metrics and Sentry.

Values live in contextvars, so they follow the request into sync endpoints
(Starlette copies the context into its threadpool) and background tasks.
"""

from __future__ import annotations

import re
import uuid
from contextvars import ContextVar

REQUEST_ID_HEADER = "X-Request-ID"
MAX_REQUEST_ID_LENGTH = 128
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:\-]+$")
_TENANT_RE = re.compile(r"^[a-z0-9][a-z0-9_.\-]{0,63}$")

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
tenant_id_var: ContextVar[str | None] = ContextVar("tenant_id", default=None)


def new_request_id() -> str:
    return uuid.uuid4().hex


def valid_request_id(value: str | None) -> str | None:
    """The incoming id if it is safe to echo into logs and headers, else None."""
    if not value:
        return None
    value = value.strip()
    if not value or len(value) > MAX_REQUEST_ID_LENGTH:
        return None
    if not _REQUEST_ID_RE.match(value):
        return None
    return value


def clean_tenant(value: object) -> str | None:
    """Normalise a tenant id/slug; anything odd-looking becomes "invalid".

    Tenant ids come from query strings, so they are attacker-controlled and
    must not be copied verbatim into logs, metric labels or Sentry tags.
    """
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    return text if _TENANT_RE.match(text) else "invalid"


def get_request_id() -> str | None:
    return request_id_var.get()


def get_tenant_id() -> str | None:
    return tenant_id_var.get()


def set_tenant(tenant_id: object) -> None:
    """Let code that learns the store later (e.g. a webhook) attribute the request."""
    tenant_id_var.set(clean_tenant(tenant_id))
