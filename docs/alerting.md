# Alerting

Every place in the code that hits an operational failure worth knowing about
calls one function — `alert(event, **context)` on the backend
(`app/observability/alerts.py`), `reportAlert(event, context)` on the
frontend (`client/src/observability.ts`). It tags the Sentry event
`alert=<event>` and always logs, Sentry or not.

**`app/tools/sentry_alerts.py` is the only place alert routing is decided.**
It holds a catalog (`RULES`) mapping each event to a Sentry alert rule —
who it pages, how urgently, and at what volume — and applies that catalog to
Sentry's API idempotently. Nothing is configured by hand in the Sentry UI.

## Why code, not clicking

- **Nothing can go silently unrouted.** `tests/test_sentry_alerts.py` scans
  every `alert(...)` / `reportAlert(...)` call site and fails the build if an
  event isn't in `RULES` or `UNROUTED` (with a reason). Add a new alert call
  without adding it to the catalog, and the test suite catches it before a
  real incident does.
- **Re-running is safe.** `sync()` only ever touches rules named with the
  `[rc] ` prefix; anything created by hand in Sentry's UI is left alone. A
  rule already matching the catalog is left as `keep`, not recreated.
- **The blast radius of a bad change is visible before it happens.** The
  default is always a dry run that prints the plan; nothing is created,
  changed or deleted until `--apply`.

## Running it

```
set SENTRY_AUTH_TOKEN=<personal token, scopes: alerts:write, project:read>
python -m app.tools.sentry_alerts                    # dry run
python -m app.tools.sentry_alerts --apply             # create/update
python -m app.tools.sentry_alerts --apply --prune     # also delete retired rules
```

Get the token from Sentry → user avatar → **User settings → Auth Tokens →
Create New Token**. Run this after adding a new alert() call to the code
(and after adding it to `RULES`), and periodically to fix drift if a rule was
edited by hand in the UI.

## Severities

| Severity | Meaning | Fires on |
|---|---|---|
| **P1** | Money moved wrong, or checkout is broken | Every occurrence, throttled to at most one email per 5–15 min |
| **P2** | A third-party integration is degrading | Only once it's more than background noise (a threshold over a time window) |
| **P3** | Worth knowing, not urgent | New/regressed issues, a frontend error spike |

## Current catalog

See `RULES` in `app/tools/sentry_alerts.py` for the exact list — it's the
source of truth and this table will drift, but roughly:

- **P1:** `razorpay.webhook_failed`, `razorpay.webhook_terminal_failure`,
  `razorpay.refund_failed`, `billing.webhook_failed`, `ledger.write_failed`,
  `checkout.verify_failed`, `checkout.razorpay_unavailable`
- **P2:** `razorpay.webhook_signature_invalid` (>5/15m — a lone hit is
  probably a bot), `whatsapp.send_failed` (>10/h), `delhivery.request_failed`
  (>5/15m), `shipment_sync.run_crashed`, `checkout.order_failed` (>10/h),
  `checkout.payment_failed` (>20/h — card declines are normal, a burst isn't)
- **Deliberately unrouted:** `delhivery.request_rejected` — a 4xx from
  Delhivery is almost always bad input, not an outage; still visible in
  Sentry, just doesn't page.

## The shipment sync heartbeat

`alert()` catches errors; it can't catch a job that stops running entirely.
`app/observability/heartbeat.py` sends a Sentry
[Cron check-in](https://docs.sentry.io/product/crons/) at the start and end
of every `run_sync_once()` call (`app/services/shipment_sync.py`). If the
loop task dies, the host goes to sleep, or the lease gets stuck, Sentry
notices the missing check-in on its own — no polling code needed on our
side. The monitor (`delhivery-shipment-sync`) is created automatically the
first time a check-in is sent; nothing to set up by hand.
