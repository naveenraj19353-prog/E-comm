"""Fixed-window rate limits kept in MongoDB so they hold across workers and instances."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from hashlib import sha256

from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.config import TRUSTED_PROXY_HOPS
from app.database.mongo import rate_limits

logger = logging.getLogger(__name__)

MINUTE = 60
HOUR = 60 * MINUTE


def client_ip(request: Request) -> str:
    """Caller IP, read from X-Forwarded-For only as far as trusted proxies go."""
    if TRUSTED_PROXY_HOPS > 0:
        forwarded = request.headers.get("x-forwarded-for", "")
        hosts = [host.strip() for host in forwarded.split(",") if host.strip()]
        if len(hosts) >= TRUSTED_PROXY_HOPS:
            return hosts[-TRUSTED_PROXY_HOPS]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _retry_message(seconds: int) -> str:
    minutes = max(1, (seconds + 59) // 60)
    unit = "minute" if minutes == 1 else "minutes"
    return f"Too many attempts. Try again in {minutes} {unit}."


def _window(window_seconds: int) -> tuple[int, int, int]:
    now = int(datetime.now(timezone.utc).timestamp())
    window_start = now - now % window_seconds
    return now, window_start, window_start + window_seconds


def _doc_id(scope: str, key: str, window_start: int) -> str:
    digest = sha256(str(key).strip().lower().encode("utf-8")).hexdigest()
    return f"{scope}:{digest}:{window_start}"


def _too_many(now: int, window_end: int) -> HTTPException:
    retry_after = max(1, window_end - now)
    return HTTPException(
        status_code=429,
        detail=_retry_message(retry_after),
        headers={"Retry-After": str(retry_after)},
    )


def _increment(scope: str, key: str, window_seconds: int) -> int | None:
    """Add one to the counter; returns the new count (None if Mongo is down)."""
    _now, window_start, window_end = _window(window_seconds)
    try:
        record = rate_limits.find_one_and_update(
            {"_id": _doc_id(scope, key, window_start)},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {
                    "expiresAt": datetime.fromtimestamp(window_end, timezone.utc),
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except PyMongoError:
        logger.exception("Rate limit update failed for scope %s", scope)
        return None
    return int((record or {}).get("count") or 0)


def hit(scope: str, key: str, *, limit: int, window_seconds: int) -> None:
    """Count one attempt for (scope, key); raise 429 once the window's limit is passed.

    Keys are hashed so emails and phone numbers are not stored here. If MongoDB
    is unreachable the request is let through; the caller will fail on its own
    database access anyway.
    """
    count = _increment(scope, key, window_seconds)
    if count is not None and count > limit:
        now, _start, window_end = _window(window_seconds)
        raise _too_many(now, window_end)


def ensure_not_blocked(scope: str, key: str, *, limit: int, window_seconds: int) -> None:
    """Raise 429 if (scope, key) already used up this window, without counting.

    Pair with `record_failure` to limit only *failed* attempts — so knowing
    someone's email is not enough to lock them out of their account.
    """
    now, window_start, window_end = _window(window_seconds)
    try:
        record = rate_limits.find_one({"_id": _doc_id(scope, key, window_start)}, {"count": 1})
    except PyMongoError:
        logger.exception("Rate limit check failed for scope %s", scope)
        return
    if int((record or {}).get("count") or 0) >= limit:
        raise _too_many(now, window_end)


def record_failure(scope: str, key: str, *, window_seconds: int) -> None:
    _increment(scope, key, window_seconds)
