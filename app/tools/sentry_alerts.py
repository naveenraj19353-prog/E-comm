"""Sentry alert rules as code: one catalog, applied idempotently.

    set SENTRY_AUTH_TOKEN=<personal token with alerts:write, project:read>
    python -m app.tools.sentry_alerts            # dry run: show the plan
    python -m app.tools.sentry_alerts --apply    # create / update the rules
    python -m app.tools.sentry_alerts --apply --prune   # also delete retired ones

Every rule this tool owns is named "[rc] ..."; rules without that prefix
(anything made by hand in the Sentry UI) are never read, changed or deleted.
The catalog below is the single place alert routing is decided, and
tests/test_sentry_alerts.py fails if code emits an alert event that no rule
routes. See docs/alerting.md for what each alert means and what to do.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field

MANAGED_PREFIX = "[rc] "

DEFAULT_API_BASE = "https://sentry.io"
DEFAULT_ORG = "retail-cosmos"
DEFAULT_PROJECTS = {"api": "retailcosmos-api", "ui": "retailcosmos-ui"}

_FIRST_SEEN = {"id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"}
_REGRESSION = {"id": "sentry.rules.conditions.regression_event.RegressionEventCondition"}
_EMAIL = {
    "id": "sentry.mail.actions.NotifyEmailAction",
    "targetType": "IssueOwners",
    "fallthroughType": "ActiveMembers",
}


def _seen_more_than(count: int, interval: str) -> dict:
    """"The issue is seen more than `count` times in `interval`."

    alert() fingerprints each event type into one issue, so count=0 means
    "every occurrence" (throttled by the rule's action interval)."""
    return {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "value": count,
        "comparisonType": "count",
        "interval": interval,
    }


def _tag_is(key: str, value: str) -> dict:
    return {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": key,
        "match": "eq",
        "value": value,
    }


@dataclass(frozen=True)
class Rule:
    name: str
    project: str  # "api" or "ui"
    severity: str  # "P1" money / checkout broken, "P2" integration, "P3" general
    conditions: tuple[dict, ...]
    alert_event: str | None = None  # the `alert` tag this rule matches, if any
    extra_filters: tuple[dict, ...] = field(default_factory=tuple)
    action_interval_minutes: int = 30

    @property
    def full_name(self) -> str:
        return f"{MANAGED_PREFIX}{self.severity} {self.name}"


def _every(event: str, project: str, severity: str, *, throttle: int) -> Rule:
    return Rule(
        name=event,
        project=project,
        severity=severity,
        conditions=(_seen_more_than(0, "1m"),),
        alert_event=event,
        action_interval_minutes=throttle,
    )


def _spike(event: str, project: str, severity: str, count: int, interval: str, *, throttle: int = 60) -> Rule:
    return Rule(
        name=f"{event} (>{count}/{interval})",
        project=project,
        severity=severity,
        conditions=(_seen_more_than(count, interval),),
        alert_event=event,
        action_interval_minutes=throttle,
    )


# --------------------------------------------------------------------------
# The catalog. Add a rule here whenever code gains a new alert(...) event.
# --------------------------------------------------------------------------
RULES: tuple[Rule, ...] = (
    # P1 — money is involved or checkout is broken: every occurrence.
    _every("razorpay.webhook_failed", "api", "P1", throttle=5),
    _every("razorpay.webhook_terminal_failure", "api", "P1", throttle=5),
    _every("razorpay.refund_failed", "api", "P1", throttle=5),
    _every("billing.webhook_failed", "api", "P1", throttle=5),
    _every("ledger.write_failed", "api", "P1", throttle=15),
    _every("checkout.verify_failed", "ui", "P1", throttle=5),
    _every("checkout.razorpay_unavailable", "ui", "P1", throttle=15),
    # P2 — an integration is degrading: only when it's more than noise.
    _spike("razorpay.webhook_signature_invalid", "api", "P2", 5, "15m"),
    _spike("whatsapp.send_failed", "api", "P2", 10, "1h"),
    _spike("delhivery.request_failed", "api", "P2", 5, "15m"),
    _every("shipment_sync.run_crashed", "api", "P2", throttle=60),
    _spike("checkout.order_failed", "ui", "P2", 10, "1h"),
    # Card declines are normal; a burst means the gateway itself is failing.
    _spike("checkout.payment_failed", "ui", "P2", 20, "1h"),
    # P3 — anything new or back, and runaway frontend errors.
    Rule("new issue", "api", "P3", (_FIRST_SEEN,)),
    Rule("regression", "api", "P3", (_REGRESSION,)),
    Rule("new issue", "ui", "P3", (_FIRST_SEEN,)),
    Rule("regression", "ui", "P3", (_REGRESSION,)),
    Rule("error spike (>50/1h)", "ui", "P3", (_seen_more_than(50, "1h"),), action_interval_minutes=60),
)

# Alert events deliberately not routed anywhere, with the reason. They are
# still visible in Sentry; they just don't notify anyone.
UNROUTED: dict[str, str] = {
    "delhivery.request_rejected": (
        "4xx from Delhivery is almost always bad input (pincode, waybill); "
        "it shows in Sentry but paging on it would be noise."
    ),
}


def routed_events() -> set[str]:
    return {rule.alert_event for rule in RULES if rule.alert_event}


def build_payload(rule: Rule, environment: str | None) -> dict:
    filters = list(rule.extra_filters)
    if rule.alert_event:
        filters.insert(0, _tag_is("alert", rule.alert_event))
    payload = {
        "name": rule.full_name,
        # Conditions are alternatives ("any"); filters must all hold ("all").
        "actionMatch": "any",
        "filterMatch": "all",
        "frequency": rule.action_interval_minutes,
        "conditions": [dict(condition) for condition in rule.conditions],
        "filters": filters,
        "actions": [dict(_EMAIL)],
    }
    if environment:
        payload["environment"] = environment
    return payload


# The fields we own on a rule; anything else Sentry adds is ignored when
# deciding whether an existing rule needs an update.
_COMPARED = ("actionMatch", "filterMatch", "frequency", "conditions", "filters", "actions", "environment")


def _normalise(payload: dict) -> dict:
    def clean(items):
        return sorted(
            (
                {key: value for key, value in item.items() if key not in {"name", "uuid"}}
                for item in items or []
            ),
            key=lambda item: json.dumps(item, sort_keys=True),
        )

    result = {}
    for key in _COMPARED:
        value = payload.get(key)
        if key in {"conditions", "filters", "actions"}:
            value = clean(value)
        elif key == "frequency" and value is not None:
            value = int(value)
        result[key] = value
    return result


def plan(existing: list[dict], desired: list[dict], *, prune: bool) -> list[tuple[str, dict]]:
    """[(action, payload-or-existing)] with action in create/update/delete/keep."""
    managed = {
        rule["name"]: rule for rule in existing if str(rule.get("name", "")).startswith(MANAGED_PREFIX)
    }
    steps: list[tuple[str, dict]] = []
    for payload in desired:
        current = managed.pop(payload["name"], None)
        if current is None:
            steps.append(("create", payload))
        elif _normalise(current) != _normalise(payload):
            steps.append(("update", {**payload, "id": current["id"]}))
        else:
            steps.append(("keep", payload))
    if prune:
        steps.extend(("delete", rule) for rule in managed.values())
    return steps


class SentryApi:
    def __init__(self, token: str, base: str = DEFAULT_API_BASE, session=None):
        import requests

        self.base = base.rstrip("/")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

    def _url(self, org: str, project: str, rule_id: str | None = None) -> str:
        from urllib.parse import quote

        segments = [quote(org, safe=""), quote(project, safe=""), "rules"]
        if rule_id:
            segments.append(quote(rule_id, safe=""))
        return f"{self.base}/api/0/projects/{'/'.join(segments)}/"

    def _check(self, response, what: str):
        if response.status_code >= 400:
            raise RuntimeError(f"{what} failed: HTTP {response.status_code} {response.text[:500]}")
        return response.json() if response.content else None

    def list_rules(self, org: str, project: str) -> list[dict]:
        return self._check(self.session.get(self._url(org, project), timeout=30), f"list rules ({project})") or []

    def create_rule(self, org: str, project: str, payload: dict) -> dict:
        return self._check(
            self.session.post(self._url(org, project), json=payload, timeout=30),
            f"create {payload['name']!r}",
        )

    def update_rule(self, org: str, project: str, rule_id: str, payload: dict) -> dict:
        return self._check(
            self.session.put(self._url(org, project, rule_id), json=payload, timeout=30),
            f"update {payload['name']!r}",
        )

    def delete_rule(self, org: str, project: str, rule_id: str) -> None:
        self._check(
            self.session.delete(self._url(org, project, rule_id), timeout=30),
            f"delete rule {rule_id}",
        )


def sync(api, org: str, projects: dict[str, str], *, environment: str | None, apply: bool, prune: bool, out=print) -> int:
    changes = 0
    for key, slug in projects.items():
        desired = [build_payload(rule, environment) for rule in RULES if rule.project == key]
        steps = plan(api.list_rules(org, slug), desired, prune=prune)
        out(f"\n{slug}:")
        for action, item in steps:
            out(f"  {action:<6} {item['name']}")
            if action == "keep":
                continue
            changes += 1
            if not apply:
                continue
            body = {k: v for k, v in item.items() if k != "id"}
            if action == "create":
                api.create_rule(org, slug, body)
            elif action == "update":
                api.update_rule(org, slug, item["id"], body)
            elif action == "delete":
                api.delete_rule(org, slug, item["id"])
    if not apply:
        out(f"\nDry run: {changes} change(s). Re-run with --apply to make them.")
    else:
        out(f"\nApplied {changes} change(s).")
    return changes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tools.sentry_alerts", description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Make the changes (default: dry run)")
    parser.add_argument("--prune", action="store_true", help="Also delete [rc] rules no longer in the catalog")
    parser.add_argument("--org", default=os.getenv("SENTRY_ORG", DEFAULT_ORG))
    parser.add_argument("--api-project", default=os.getenv("SENTRY_API_PROJECT", DEFAULT_PROJECTS["api"]))
    parser.add_argument("--ui-project", default=os.getenv("SENTRY_UI_PROJECT", DEFAULT_PROJECTS["ui"]))
    parser.add_argument(
        "--environment",
        default="production",
        help='Only alert on this Sentry environment ("" for all). Keeps local testing quiet.',
    )
    parser.add_argument("--api-base", default=os.getenv("SENTRY_API_BASE", DEFAULT_API_BASE))
    args = parser.parse_args(argv)

    token = os.getenv("SENTRY_AUTH_TOKEN", "").strip()
    if not token:
        print(
            "SENTRY_AUTH_TOKEN is not set. Create one at Sentry → User settings → "
            "Personal Tokens with scopes alerts:write and project:read.",
            file=sys.stderr,
        )
        return 2
    api = SentryApi(token, args.api_base)
    try:
        sync(
            api,
            args.org,
            {"api": args.api_project, "ui": args.ui_project},
            environment=args.environment or None,
            apply=args.apply,
            prune=args.prune,
        )
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
