"""The alert catalog in app/tools/sentry_alerts.py is the single source of
truth for what pages someone: if code starts sending a new `alert(...)` /
`reportAlert(...)` event, this test fails until it's added to the catalog
(routed or explicitly listed as UNROUTED with a reason). Silence-by-omission
is exactly the bug the catalog exists to prevent.
"""

import re
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import MagicMock

from app.tools import sentry_alerts as mod

ROOT = Path(__file__).resolve().parent.parent

# The event name is a string literal shaped like "domain.thing"; it may not
# be the literal first token after the opening paren — e.g. Delhivery picks
# between two event names with a ternary — so this finds every such literal
# inside each call's argument list, not just the first.
EVENT_LITERAL = re.compile(r'"([a-z][a-z0-9_]*\.[a-z0-9_.]+)"')
PY_CALL_START = re.compile(r'\balert(?:_on_error)?\(')
TS_CALL_START = re.compile(r'\breportAlert\(')


def _first_argument_span(text: str, open_paren_index: int) -> str:
    """The call's first argument only: up to the first top-level comma (or
    the closing paren, if there's just one argument). A ternary picking
    between two event-name literals is still one argument; a later keyword
    argument's own string value (e.g. `event_type="product.shared"`) is not
    the alert's event name and must not be picked up here."""
    depth = 0
    for i in range(open_paren_index, len(text)):
        char = text[i]
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
            if depth == 0:
                return text[open_paren_index + 1 : i]
        elif char == "," and depth == 1:
            return text[open_paren_index + 1 : i]
    return text[open_paren_index + 1 :]


def _emitted_events(root: Path, call_start: re.Pattern, *, glob: str, skip: tuple[str, ...]) -> set[str]:
    events: set[str] = set()
    for path in root.rglob(glob):
        text_path = path.as_posix()
        if any(part in text_path for part in skip):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in call_start.finditer(text):
            span = _first_argument_span(text, match.end() - 1)
            events.update(EVENT_LITERAL.findall(span))
    return events


def backend_alert_events() -> set[str]:
    return _emitted_events(
        ROOT / "app", PY_CALL_START, glob="*.py", skip=("observability/alerts.py", "tools/sentry_alerts.py")
    )


def frontend_alert_events() -> set[str]:
    client_src = ROOT / "client" / "src"
    if not client_src.exists():
        return set()
    events: set[str] = set()
    for glob in ("*.ts", "*.tsx"):
        events |= _emitted_events(client_src, TS_CALL_START, glob=glob, skip=("observability.ts",))
    return events


class CatalogCoversEveryAlertTests(unittest.TestCase):
    def test_every_backend_alert_is_routed_or_explicitly_unrouted(self):
        emitted = backend_alert_events()
        self.assertTrue(emitted, "no alert(...) calls found — the scan itself may be broken")
        uncovered = emitted - mod.routed_events() - mod.UNROUTED.keys()
        self.assertEqual(
            uncovered,
            set(),
            f"{uncovered} paged nobody: add to RULES or UNROUTED (with a reason) in app/tools/sentry_alerts.py",
        )

    def test_every_frontend_alert_is_routed(self):
        emitted = frontend_alert_events()
        self.assertTrue(emitted, "no reportAlert(...) calls found — the scan itself may be broken")
        uncovered = emitted - mod.routed_events() - mod.UNROUTED.keys()
        self.assertEqual(uncovered, set(), f"{uncovered} paged nobody: add to RULES in app/tools/sentry_alerts.py")

    def test_the_catalog_has_no_stale_rules_for_alerts_that_no_longer_exist(self):
        """Keeps the catalog honest in the other direction: a removed
        alert() call should retire its rule, not linger as a rule that can
        never fire."""
        emitted = backend_alert_events() | frontend_alert_events()
        stale = mod.routed_events() - emitted
        self.assertEqual(stale, set(), f"{stale} have a rule but nothing emits them anymore")

    def test_unrouted_events_are_still_real(self):
        emitted = backend_alert_events() | frontend_alert_events()
        phantom = mod.UNROUTED.keys() - emitted
        self.assertEqual(phantom, set(), f"{phantom} are listed as deliberately unrouted but nothing emits them")


class RulePayloadTests(unittest.TestCase):
    def test_every_rule_filters_on_its_alert_tag(self):
        for rule in mod.RULES:
            if rule.alert_event is None:
                continue  # generic rules (new issue, regression, error spike)
            payload = mod.build_payload(rule, environment=None)
            self.assertIn(
                {"id": "sentry.rules.filters.tagged_event.TaggedEventFilter", "key": "alert", "match": "eq", "value": rule.alert_event},
                payload["filters"],
            )

    def test_names_are_unique_per_project(self):
        seen = set()
        for rule in mod.RULES:
            key = (rule.project, rule.full_name)
            self.assertNotIn(key, seen, f"duplicate rule name {key} — Sentry would create two rules")
            seen.add(key)

    def test_p1_rules_fire_on_every_occurrence_with_a_tight_throttle(self):
        """P1 = money/checkout broken. These must not require a volume
        threshold to fire, and must not sit un-throttled either (a retry
        storm shouldn't flood an inbox)."""
        for rule in mod.RULES:
            if rule.severity != "P1":
                continue
            self.assertEqual(len(rule.conditions), 1)
            condition = rule.conditions[0]
            self.assertEqual(condition.get("value"), 0, f"{rule.name} should page on the first occurrence")
            self.assertLessEqual(rule.action_interval_minutes, 15)

    def test_managed_rule_names_carry_the_prefix_plan_relies_on(self):
        for rule in mod.RULES:
            self.assertTrue(rule.full_name.startswith(mod.MANAGED_PREFIX))


class PlanTests(unittest.TestCase):
    """`plan()` decides create/update/keep/delete without ever touching a
    rule Sentry (or a human) made outside this tool."""

    def test_unmanaged_rules_are_never_touched(self):
        existing = [{"id": "1", "name": "Someone's manual rule", "actionMatch": "any"}]
        desired = [mod.build_payload(mod.RULES[0], environment=None)]
        steps = mod.plan(existing, desired, prune=True)
        actions = {name: action for action, item in steps for name in [item.get("name")]}
        self.assertNotIn("Someone's manual rule", actions)

    def test_identical_existing_rule_is_kept_not_updated(self):
        payload = mod.build_payload(mod.RULES[0], environment=None)
        existing = [{**payload, "id": "42"}]
        steps = mod.plan(existing, [payload], prune=False)
        self.assertEqual(steps, [("keep", payload)])

    def test_changed_rule_is_updated_with_its_existing_id(self):
        payload = mod.build_payload(mod.RULES[0], environment=None)
        existing = [{**payload, "id": "42", "frequency": 999}]
        steps = mod.plan(existing, [payload], prune=False)
        self.assertEqual(steps, [("update", {**payload, "id": "42"})])

    def test_missing_rule_is_created(self):
        payload = mod.build_payload(mod.RULES[0], environment=None)
        steps = mod.plan([], [payload], prune=False)
        self.assertEqual(steps, [("create", payload)])

    def test_retired_managed_rule_is_deleted_only_with_prune(self):
        existing = [{"id": "9", "name": f"{mod.MANAGED_PREFIX}P3 retired rule", "actionMatch": "any"}]
        without_prune = mod.plan(existing, [], prune=False)
        self.assertEqual(without_prune, [])
        with_prune = mod.plan(existing, [], prune=True)
        self.assertEqual(with_prune, [("delete", existing[0])])


class SentryApiTests(unittest.TestCase):
    """The thin HTTP client: correct verbs/URLs, and it surfaces API errors
    instead of silently doing nothing."""

    def _api(self, session):
        return mod.SentryApi("tok", base="https://sentry.example", session=session)

    def test_authorization_header_is_set(self):
        session = MagicMock()
        api = self._api(session)
        self.assertEqual(session.headers.update.call_args.args[0]["Authorization"], "Bearer tok")

    def test_create_posts_to_the_project_rules_endpoint(self):
        session = MagicMock()
        session.post.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {"id": "1"})
        api = self._api(session)
        api.create_rule("my-org", "my-proj", {"name": "x"})
        url = session.post.call_args.args[0]
        self.assertEqual(url, "https://sentry.example/api/0/projects/my-org/my-proj/rules/")

    def test_update_puts_to_the_specific_rule(self):
        session = MagicMock()
        session.put.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {})
        api = self._api(session)
        api.update_rule("org", "proj", "77", {"name": "x"})
        url = session.put.call_args.args[0]
        self.assertEqual(url, "https://sentry.example/api/0/projects/org/proj/rules/77/")

    def test_org_and_project_slugs_with_special_characters_do_not_corrupt_the_path(self):
        session = MagicMock()
        session.get.return_value = MagicMock(status_code=200, content=b"[]", json=lambda: [])
        api = self._api(session)
        api.list_rules("weird org/../x", "proj")
        url = session.get.call_args.args[0]
        parsed = urllib.parse.urlsplit(url)
        # A slash (or traversal) in the slug must not escape the org segment
        # of the path into a different, unintended API route.
        self.assertTrue(parsed.path.startswith("/api/0/projects/"))
        self.assertNotIn("..", urllib.parse.unquote(parsed.path).split("/projects/", 1)[1].split("/")[0:1])

    def test_an_error_response_raises_instead_of_being_swallowed(self):
        session = MagicMock()
        session.get.return_value = MagicMock(status_code=403, text="forbidden", content=b"forbidden")
        api = self._api(session)
        with self.assertRaises(RuntimeError):
            api.list_rules("org", "proj")


if __name__ == "__main__":
    unittest.main()
