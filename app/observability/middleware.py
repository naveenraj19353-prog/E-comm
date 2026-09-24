"""ASGI middleware: request id, tenant attribution, access log and metrics."""

from __future__ import annotations

import logging
import time
from urllib.parse import parse_qs

from jose import JWTError, jwt
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.observability.context import (
    REQUEST_ID_HEADER,
    clean_tenant,
    new_request_id,
    request_id_var,
    tenant_id_var,
    valid_request_id,
)
from app.observability.metrics import RequestMetrics, registry as default_registry

access_logger = logging.getLogger("app.access")

# No access line and no metrics for probes and scrapes (they would drown the
# numbers that matter).
QUIET_PATHS = frozenset({"/healthcheck", "/metrics"})


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key.lower() == name:
            return value.decode("latin-1")
    return None


def _query_tenant(scope: Scope) -> str | None:
    raw = scope.get("query_string") or b""
    if b"tenantId" not in raw:
        return None
    values = parse_qs(raw.decode("latin-1")).get("tenantId")
    return values[0] if values else None


def tenant_for_scope(scope: Scope) -> str | None:
    """Which store a request belongs to (mirrors store_rate_limit.store_key_for).

    Order: a *verified* bearer token's tenantId, then a `tenantId` query
    parameter, then a `/tenants/slug/{slug}` path. Unverified tokens are
    ignored so nobody can attribute traffic to another store.
    """
    header = _header(scope, b"authorization") or ""
    if header[:7].lower() == "bearer ":
        try:
            from app.utils.jwt_handler import ALGORITHM, SECRET_KEY

            payload = jwt.decode(header[7:].strip(), SECRET_KEY, algorithms=[ALGORITHM])
        except (JWTError, RuntimeError):
            payload = {}
        if payload.get("tenantId"):
            return clean_tenant(payload["tenantId"])
    query_tenant = _query_tenant(scope)
    if query_tenant and query_tenant.strip():
        return clean_tenant(query_tenant)
    path = scope.get("path") or ""
    if path.startswith("/tenants/slug/"):
        return clean_tenant(path[len("/tenants/slug/"):].split("/", 1)[0])
    return None


def route_template(scope: Scope) -> str | None:
    """The matched route's path template, set on the scope by the router."""
    path = getattr(scope.get("route"), "path", None)
    return path or None


class ObservabilityMiddleware:
    """Outermost middleware: sets the request id / tenant context for everything
    downstream, echoes X-Request-ID, logs one access line and records metrics."""

    def __init__(self, app: ASGIApp, metrics: RequestMetrics | None = None):
        self.app = app
        self.metrics = metrics or default_registry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = valid_request_id(_header(scope, b"x-request-id")) or new_request_id()
        tenant = tenant_for_scope(scope)
        rid_token = request_id_var.set(request_id)
        tenant_token = tenant_id_var.set(tenant)
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        state["tenant_id"] = tenant

        status_holder = {"status": 500}
        header_value = request_id.encode("latin-1")

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                status_holder["started"] = True
                headers = [
                    (k, v) for k, v in message.get("headers", []) if k.lower() != b"x-request-id"
                ]
                headers.append((REQUEST_ID_HEADER.lower().encode(), header_value))
                message = {**message, "headers": headers}
            await send(message)

        started = time.perf_counter()
        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            response_started = "started" in status_holder
            status_holder["status"] = 500
            if not response_started:
                # Answer here so even crash responses carry X-Request-ID; the
                # exception still propagates to Starlette/Sentry as before.
                try:
                    await send_with_request_id(
                        {
                            "type": "http.response.start",
                            "status": 500,
                            "headers": [(b"content-type", b"application/json")],
                        }
                    )
                    await send(
                        {"type": "http.response.body", "body": b'{"detail":"Internal Server Error"}'}
                    )
                except Exception:  # client went away; keep the original error
                    pass
            raise
        finally:
            duration = time.perf_counter() - started
            try:
                self._record(scope, tenant, status_holder["status"], duration)
            finally:
                request_id_var.reset(rid_token)
                tenant_id_var.reset(tenant_token)

    def _record(self, scope: Scope, tenant: str | None, status: int, duration: float) -> None:
        path = scope.get("path") or ""
        if path in QUIET_PATHS:
            return
        route = route_template(scope)
        method = scope.get("method", "")
        self.metrics.observe(
            tenant=tenant,
            route=route,
            method=method,
            status=status,
            duration_seconds=duration,
        )
        duration_ms = round(duration * 1000, 1)
        level = logging.WARNING if status >= 500 else logging.INFO
        access_logger.log(
            level,
            "%s %s %s %.1fms",
            method,
            route or "unmatched",
            status,
            duration_ms,
            extra={
                "http_method": method,
                "http_route": route or "unmatched",
                "http_status": status,
                "duration_ms": duration_ms,
                "tenant": tenant,
            },
        )
