"""Sentry Cron check-ins for background jobs: alert when a job *stops running*.

Errors inside a job reach Sentry on their own. What doesn't is a job that
silently never runs — the loop task died, the host went to sleep, the lease
got stuck. A Cron monitor notices the missing check-in and alerts.

`monitor_config` is sent with every check-in, so Sentry creates or updates
the monitor itself; nothing has to be set up by hand. A no-op while Sentry
is off, and it never raises: monitoring must not break the job.
"""

from __future__ import annotations

import logging

from app.observability import sentry as sentry_state

logger = logging.getLogger(__name__)


def _monitor_config(interval_minutes: int, max_runtime_minutes: int) -> dict:
    return {
        "schedule": {"type": "interval", "value": max(int(interval_minutes), 1), "unit": "minute"},
        # A run may start up to this late before it counts as missed. Loops
        # wake with jitter and a sibling process may hold the lease, so be
        # generous: one extra interval.
        "checkin_margin": max(int(interval_minutes), 5),
        "max_runtime": max(int(max_runtime_minutes), 1),
        "failure_issue_threshold": 1,
        "recovery_threshold": 1,
    }


def job_started(slug: str, *, interval_minutes: int, max_runtime_minutes: int) -> str | None:
    """Report a run starting. Returns a check-in id for `job_finished`."""
    if not sentry_state.is_enabled():
        return None
    try:
        from sentry_sdk.crons import capture_checkin
        from sentry_sdk.crons.consts import MonitorStatus

        return capture_checkin(
            monitor_slug=slug,
            status=MonitorStatus.IN_PROGRESS,
            monitor_config=_monitor_config(interval_minutes, max_runtime_minutes),
        )
    except Exception:
        logger.exception("Cron check-in (start) failed for %s", slug)
        return None


def job_finished(
    slug: str,
    check_in_id: str | None,
    *,
    ok: bool,
    duration_seconds: float | None = None,
    interval_minutes: int,
    max_runtime_minutes: int,
) -> None:
    if not sentry_state.is_enabled() or not check_in_id:
        return
    try:
        from sentry_sdk.crons import capture_checkin
        from sentry_sdk.crons.consts import MonitorStatus

        capture_checkin(
            monitor_slug=slug,
            check_in_id=check_in_id,
            status=MonitorStatus.OK if ok else MonitorStatus.ERROR,
            duration=duration_seconds,
            monitor_config=_monitor_config(interval_minutes, max_runtime_minutes),
        )
    except Exception:
        logger.exception("Cron check-in (finish) failed for %s", slug)
