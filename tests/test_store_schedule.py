from datetime import datetime, timezone

from app.services.store_schedule import resolve_store_hours


def test_disabled_schedule_keeps_store_open():
    result = resolve_store_hours({"enabled": False, "defaultOpen": False})
    assert result["isOpen"] is True


def test_off_window_closes_store_and_sets_timer():
    now = datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc)
    result = resolve_store_hours(
        {
            "enabled": True,
            "defaultOpen": True,
            "windows": [
                {
                    "kind": "off",
                    "startAt": "2026-09-21T09:00:00Z",
                    "endAt": "2026-09-21T12:00:00Z",
                }
            ],
        },
        now=now,
    )
    assert result["isOpen"] is False
    assert result["nextChangeAt"] == "2026-09-21T12:00:00Z"


def test_on_window_opens_store_when_default_is_closed():
    now = datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc)
    result = resolve_store_hours(
        {
            "enabled": True,
            "defaultOpen": False,
            "windows": [
                {
                    "kind": "on",
                    "startAt": "2026-09-21T09:00:00Z",
                    "endAt": "2026-09-21T18:00:00Z",
                }
            ],
        },
        now=now,
    )
    assert result["isOpen"] is True
