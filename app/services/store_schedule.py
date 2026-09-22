from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

MAX_WINDOWS = 20
MAX_IMAGES = 5
MAX_MESSAGE = 400


def _parse_iso(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def normalize_store_hours(raw: object) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    message = str(data.get("message") or "").strip()[:MAX_MESSAGE]
    images: list[str] = []
    for item in data.get("images") or []:
        if not isinstance(item, str):
            continue
        value = item.strip()
        if value and value not in images:
            images.append(value)
        if len(images) >= MAX_IMAGES:
            break
    windows: list[dict[str, str]] = []
    for item in data.get("windows") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip().lower()
        if kind not in {"on", "off"}:
            continue
        start = _parse_iso(item.get("startAt"))
        end = _parse_iso(item.get("endAt"))
        if not start or not end or end <= start:
            continue
        windows.append(
            {
                "kind": kind,
                "startAt": _iso(start),
                "endAt": _iso(end),
            }
        )
        if len(windows) >= MAX_WINDOWS:
            break
    windows.sort(key=lambda row: row["startAt"])
    return {
        "enabled": bool(data.get("enabled")),
        "defaultOpen": bool(data.get("defaultOpen", True)),
        "message": message,
        "images": images,
        "windows": windows,
    }


def resolve_store_hours(
    hours: dict | None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    config = normalize_store_hours(hours or {})
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if not config["enabled"]:
        return {
            **config,
            "isOpen": True,
            "nextChangeAt": None,
        }

    covering: list[dict[str, str]] = []
    boundaries: list[datetime] = []
    for window in config["windows"]:
        start = _parse_iso(window["startAt"])
        end = _parse_iso(window["endAt"])
        if not start or not end:
            continue
        if start <= current < end:
            covering.append(window)
        if start > current:
            boundaries.append(start)
        if end > current:
            boundaries.append(end)

    if any(window["kind"] == "off" for window in covering):
        is_open = False
    elif any(window["kind"] == "on" for window in covering):
        is_open = True
    else:
        is_open = bool(config["defaultOpen"])

    next_change = min(boundaries) if boundaries else None
    return {
        **config,
        "isOpen": is_open,
        "nextChangeAt": _iso(next_change) if next_change else None,
    }
