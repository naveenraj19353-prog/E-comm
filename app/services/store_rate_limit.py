"""Per-store request limits, so one store's traffic can't starve the others.

Counters live in this process's memory rather than MongoDB: a noisy store
competes for *this* server's capacity, so per-process limiting is the right
granularity, and it keeps the check free of an extra database write on every
request. With N server processes a store gets up to N x the limit in total.

A request is attributed to a store by, in order: a verified bearer token's
tenantId, a `tenantId` query parameter, or a `/tenants/slug/{slug}` path.
Super admins, webhooks and health checks are never limited.
"""

from __future__ import annotations

import threading
import time

from fastapi import Request
from jose import JWTError, jwt

from app.config import STORE_REQUESTS_PER_MINUTE
from app.utils.jwt_handler import ALGORITHM, SECRET_KEY

WINDOW_SECONDS = 60
_EXEMPT_PREFIXES = ("/health", "/healthcheck", "/payments/webhook", "/integrations/periskope/webhook")


class StoreRateLimiter:
    def __init__(self, limit_per_window: int, window_seconds: int = WINDOW_SECONDS):
        self.limit = limit_per_window
        self.window = window_seconds
        self._counts: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()

    def allow(self, store_key: str, now: float | None = None) -> tuple[bool, int]:
        """Count one request; returns (allowed, seconds until the window resets)."""
        now_int = int(now if now is not None else time.time())
        window_start = now_int - now_int % self.window
        retry_after = max(1, window_start + self.window - now_int)
        with self._lock:
            started, count = self._counts.get(store_key, (window_start, 0))
            if started != window_start:
                started, count = window_start, 0
            count += 1
            self._counts[store_key] = (started, count)
            if len(self._counts) > 10_000:
                # Drop stale windows so memory can't grow without bound.
                self._counts = {k: v for k, v in self._counts.items() if v[0] == window_start}
        return count <= self.limit, retry_after


limiter = StoreRateLimiter(STORE_REQUESTS_PER_MINUTE)


def _token_tenant(request: Request) -> tuple[str | None, bool]:
    """(tenantId, is_super_admin) from a *verified* bearer token.

    Unverified claims are never trusted: otherwise anyone could forge a token
    naming another store and burn through that store's budget.
    """
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None, False
    try:
        payload = jwt.decode(header[7:].strip(), SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None, False
    if payload.get("role") == "super_admin":
        return None, True
    tenant_id = payload.get("tenantId")
    return (str(tenant_id).strip().lower() if tenant_id else None), False


def store_key_for(request: Request) -> str | None:
    path = request.url.path
    if any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES):
        return None
    tenant_id, is_super_admin = _token_tenant(request)
    if is_super_admin:
        return None
    if tenant_id:
        return f"tenant:{tenant_id}"
    query_tenant = request.query_params.get("tenantId")
    if query_tenant and query_tenant.strip():
        return f"tenant:{query_tenant.strip().lower()}"
    if path.startswith("/tenants/slug/"):
        slug = path[len("/tenants/slug/"):].split("/", 1)[0].strip().lower()
        if slug:
            return f"slug:{slug}"
    return None
