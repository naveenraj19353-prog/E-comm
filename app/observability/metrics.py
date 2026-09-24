"""In-process request metrics per store, exposed in Prometheus text format.

Each server process (Uvicorn worker, container, EC2 instance) keeps and
reports its OWN numbers — counters reset on restart and are not shared
between processes. Scrape every process (or sum across them in Prometheus /
Grafana); a single scrape of a load-balanced URL only sees whichever process
answered.

Cardinality is bounded: routes are labelled by their template
("/product/{product_id}", never the raw path; unmatched paths share
"unmatched"), and only the first METRICS_MAX_TENANTS distinct stores get
their own label — later ones are counted under "other".
"""

from __future__ import annotations

import hmac
import threading
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from app.observability import settings

LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
NO_TENANT = "none"
OVERFLOW_TENANT = "other"
UNMATCHED_ROUTE = "unmatched"
PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def _labels(pairs: tuple[tuple[str, str], ...]) -> str:
    return ",".join(f'{name}="{_escape(value)}"' for name, value in pairs)


def _fmt(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return repr(value)


class RequestMetrics:
    def __init__(self, max_tenants: int = 100, buckets: tuple[float, ...] = LATENCY_BUCKETS):
        self.max_tenants = max(1, max_tenants)
        self.buckets = tuple(sorted(buckets))
        self._lock = threading.Lock()
        self._tenants: set[str] = set()
        # (tenant, route, method, status_class) -> count
        self._requests: dict[tuple[str, str, str, str], int] = {}
        # (tenant, route, method) -> count of 5xx
        self._errors: dict[tuple[str, str, str], int] = {}
        # (tenant, route) -> [bucket counts..., +Inf count, sum]
        self._latency: dict[tuple[str, str], list[float]] = {}
        self.started_at = time.time()

    def tenant_label(self, tenant: str | None) -> str:
        """Must be called with the lock held."""
        if not tenant:
            return NO_TENANT
        if tenant in self._tenants:
            return tenant
        if len(self._tenants) < self.max_tenants:
            self._tenants.add(tenant)
            return tenant
        return OVERFLOW_TENANT

    def observe(
        self,
        *,
        tenant: str | None,
        route: str | None,
        method: str,
        status: int,
        duration_seconds: float,
    ) -> None:
        route = route or UNMATCHED_ROUTE
        method = (method or "").upper() or "UNKNOWN"
        status_class = f"{status // 100}xx" if 100 <= status < 600 else "unknown"
        with self._lock:
            tenant_label = self.tenant_label(tenant)
            key = (tenant_label, route, method, status_class)
            self._requests[key] = self._requests.get(key, 0) + 1
            if status >= 500:
                error_key = (tenant_label, route, method)
                self._errors[error_key] = self._errors.get(error_key, 0) + 1
            hist = self._latency.get((tenant_label, route))
            if hist is None:
                hist = [0.0] * (len(self.buckets) + 2)
                self._latency[(tenant_label, route)] = hist
            for index, bound in enumerate(self.buckets):
                if duration_seconds <= bound:
                    hist[index] += 1
            hist[len(self.buckets)] += 1  # +Inf == count
            hist[len(self.buckets) + 1] += duration_seconds

    def render(self) -> str:
        with self._lock:
            requests = dict(self._requests)
            errors = dict(self._errors)
            latency = {key: list(value) for key, value in self._latency.items()}
            tenants_tracked = len(self._tenants)
        lines = [
            "# HELP http_requests_total HTTP requests handled by this process.",
            "# TYPE http_requests_total counter",
        ]
        for (tenant, route, method, status_class), count in sorted(requests.items()):
            labels = _labels(
                (("tenant", tenant), ("route", route), ("method", method), ("status", status_class))
            )
            lines.append(f"http_requests_total{{{labels}}} {count}")

        lines += [
            "# HELP http_request_errors_total HTTP requests that ended in a 5xx response.",
            "# TYPE http_request_errors_total counter",
        ]
        for (tenant, route, method), count in sorted(errors.items()):
            labels = _labels((("tenant", tenant), ("route", route), ("method", method)))
            lines.append(f"http_request_errors_total{{{labels}}} {count}")

        lines += [
            "# HELP http_request_duration_seconds Request latency in seconds.",
            "# TYPE http_request_duration_seconds histogram",
        ]
        for (tenant, route), hist in sorted(latency.items()):
            base = (("tenant", tenant), ("route", route))
            for index, bound in enumerate(self.buckets):
                labels = _labels(base + (("le", _fmt(bound)),))
                lines.append(f"http_request_duration_seconds_bucket{{{labels}}} {_fmt(hist[index])}")
            count = hist[len(self.buckets)]
            labels = _labels(base + (("le", "+Inf"),))
            lines.append(f"http_request_duration_seconds_bucket{{{labels}}} {_fmt(count)}")
            lines.append(f"http_request_duration_seconds_sum{{{_labels(base)}}} {hist[-1]:.6f}")
            lines.append(f"http_request_duration_seconds_count{{{_labels(base)}}} {_fmt(count)}")

        lines += [
            "# HELP metrics_tenants_tracked Distinct stores with their own label in this process.",
            "# TYPE metrics_tenants_tracked gauge",
            f"metrics_tenants_tracked {tenants_tracked}",
            "# HELP process_start_time_seconds Start time of this process (unix seconds).",
            "# TYPE process_start_time_seconds gauge",
            f"process_start_time_seconds {self.started_at:.3f}",
        ]
        return "\n".join(lines) + "\n"


registry = RequestMetrics(max_tenants=settings.METRICS_MAX_TENANTS)

router = APIRouter()


def _authorized(request: Request, token: str) -> bool:
    header = request.headers.get("authorization") or ""
    scheme, _, supplied = header.partition(" ")
    if scheme.lower() != "bearer" or not supplied.strip():
        return False
    return hmac.compare_digest(supplied.strip().encode(), token.encode())


@router.get("/metrics", include_in_schema=False)
def metrics_endpoint(request: Request) -> Response:
    """Prometheus scrape target. 404 unless METRICS_TOKEN is set; bearer auth."""
    token = settings.METRICS_TOKEN
    if not token:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if not _authorized(request, token):
        return JSONResponse(
            {"detail": "Not authenticated"},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Response(registry.render(), media_type=PROMETHEUS_CONTENT_TYPE)
