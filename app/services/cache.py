"""Small in-process TTL cache for public storefront data.

Scope and guarantees
--------------------
* Per process. Several Uvicorn/Gunicorn workers each keep their own copy; a
  write invalidates the entries of the process that handled it immediately,
  other processes keep serving their copy until it expires, i.e. they see the
  change within ``STOREFRONT_CACHE_SECONDS``.
* Keys are tuples whose first element is the tenant id, so invalidating one
  tenant can never touch (or be confused with) another tenant's entries.
* Bounded (LRU eviction) and thread-safe (sync FastAPI routes run in a pool).
* Only public, anonymous responses belong here. Never cache anything that
  depends on the caller (customer data, admin-only rows such as inactive
  products, carts, orders).
* Cached values are shared between requests: treat them as read-only.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Any, TypeVar

from app.config import STOREFRONT_CACHE_SECONDS

T = TypeVar("T")
_MISSING = object()


class TTLCache:
    def __init__(
        self,
        max_entries: int = 2048,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_entries = max(1, int(max_entries))
        self._clock = clock
        self._data: OrderedDict[tuple, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()
        # Bumped on every invalidation of a tenant; a value computed while an
        # invalidation happened is not stored (it may hold pre-write data).
        self._generations: dict[Hashable, int] = {}
        self._epoch = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def get(self, key: tuple, default: Any = None) -> Any:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return default
            expires_at, value = entry
            if expires_at <= self._clock():
                del self._data[key]
                return default
            self._data.move_to_end(key)
            return value

    def set(self, key: tuple, value: Any, ttl: float) -> None:
        if ttl <= 0:
            return
        with self._lock:
            self._store(key, value, ttl)

    def _store(self, key: tuple, value: Any, ttl: float) -> None:
        self._data[key] = (self._clock() + ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)

    def _version(self, key: tuple) -> tuple[int, int]:
        owner = key[0] if key else None
        return self._epoch, self._generations.get(owner, 0)

    def get_or_set(self, key: tuple, builder: Callable[[], T], ttl: float) -> T:
        """Return the cached value or build, store and return it."""
        if ttl <= 0:
            return builder()
        value = self.get(key, _MISSING)
        if value is not _MISSING:
            return value
        with self._lock:
            version = self._version(key)
        value = builder()
        with self._lock:
            if self._version(key) == version:
                self._store(key, value, ttl)
        return value

    def invalidate(self, key: tuple) -> None:
        with self._lock:
            self._data.pop(key, None)

    def invalidate_prefix(self, prefix: tuple) -> int:
        """Drop every key starting with ``prefix`` (a tuple). Returns the count."""
        size = len(prefix)
        with self._lock:
            if prefix:
                owner = prefix[0]
                self._generations[owner] = self._generations.get(owner, 0) + 1
            else:
                self._epoch += 1
            stale = [key for key in self._data if key[:size] == prefix]
            for key in stale:
                del self._data[key]
            return len(stale)

    def clear(self) -> None:
        with self._lock:
            self._epoch += 1
            self._data.clear()


storefront_cache = TTLCache(max_entries=4096)


def storefront_ttl() -> int:
    """Effective cache lifetime for storefront payloads, in seconds.

    Payloads embed image URLs. With presigned URLs (no CDN) the TTL is capped
    at half the guaranteed remaining lifetime of those URLs, so a cached
    response never hands out an expired or nearly expired image URL.
    """
    ttl = int(STOREFRONT_CACHE_SECONDS or 0)
    if ttl <= 0:
        return 0
    from app.services.s3_service import image_url_min_lifetime

    min_lifetime = image_url_min_lifetime()
    if min_lifetime is not None:
        ttl = min(ttl, min_lifetime // 2)
    return max(ttl, 0)


def storefront_key(tenant_id: str, kind: str, *parts: Hashable) -> tuple:
    return (str(tenant_id), kind, *parts)


def cached_storefront(
    tenant_id: str,
    kind: str,
    parts: tuple,
    builder: Callable[[], T],
) -> T:
    """Cache a public, tenant-scoped payload for ``storefront_ttl()`` seconds."""
    if not tenant_id:
        return builder()
    return storefront_cache.get_or_set(
        storefront_key(tenant_id, kind, *parts),
        builder,
        storefront_ttl(),
    )


def invalidate_tenant(tenant_id: str | None) -> None:
    """Drop this process's cached storefront data for one tenant."""
    if tenant_id:
        storefront_cache.invalidate_prefix((str(tenant_id),))
