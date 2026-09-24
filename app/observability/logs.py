"""Structured logging: request id / tenant on every record, JSON or text output."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from app.observability.context import get_request_id, get_tenant_id

# Attributes every LogRecord has; anything else was passed via `extra=`.
_STANDARD_ATTRS = set(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "request_id", "tenant_id", "taskName"}

TEXT_FORMAT = (
    "%(asctime)s %(levelname)s %(name)s "
    "[request_id=%(request_id)s tenant=%(tenant_id)s] %(message)s"
)

_HANDLER_MARK = "_retail_cosmos_observability"


class RequestContextFilter(logging.Filter):
    """Copy the current request id and tenant onto each record ("-" when none)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "request_id", None) is None:
            record.request_id = get_request_id() or "-"
        if getattr(record, "tenant_id", None) is None:
            record.tenant_id = get_tenant_id() or "-"
        return True


def _jsonable(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Extra fields passed via `extra=` are included."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": _none_if_dash(getattr(record, "request_id", None)),
            "tenant_id": _none_if_dash(getattr(record, "tenant_id", None)),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_") and key not in payload:
                payload[key] = _jsonable(value)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exception"] = record.exc_text
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def _none_if_dash(value):
    return None if value in (None, "-") else value


def build_handler(log_format: str) -> logging.Handler:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestContextFilter())
    if log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(TEXT_FORMAT))
    setattr(handler, _HANDLER_MARK, True)
    return handler


def configure_logging(log_format: str = "text", level: str = "INFO") -> logging.Handler:
    """Install our handler on the root logger (idempotent).

    In JSON mode Uvicorn's own loggers are routed through the same handler so
    the whole process emits JSON lines. Run Uvicorn with `--no-access-log`:
    the app writes its own access line (with route template and tenant).
    """
    log_format = (log_format or "text").lower()
    root = logging.getLogger()
    for existing in list(root.handlers):
        if getattr(existing, _HANDLER_MARK, False):
            root.removeHandler(existing)
    handler = build_handler(log_format)
    root.addHandler(handler)
    resolved = logging.getLevelName((level or "INFO").upper())
    root.setLevel(resolved if isinstance(resolved, int) else logging.INFO)

    if log_format == "json":
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            uv_logger = logging.getLogger(name)
            uv_logger.handlers = []
            uv_logger.propagate = True
    return handler
