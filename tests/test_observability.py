"""Request ids, structured logs, metrics, scrubbing, alerts and Sentry gating.

Everything runs against a tiny in-memory FastAPI app driven through raw ASGI
calls — no database, no network, no real Sentry.
"""

import asyncio
import io
import json
import logging
import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, Request
from jose import jwt

from app import observability
from app.observability import alerts, context, logs, metrics, scrubbing
from app.observability import sentry as sentry_module
from app.observability.metrics import RequestMetrics
from app.observability.middleware import ObservabilityMiddleware, tenant_for_scope
from app.utils.jwt_handler import ALGORITHM, SECRET_KEY


def _scope(path="/", query=b"", headers=(), method="GET"):
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": query,
        "headers": [(k.lower(), v) for k, v in headers],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
    }


def _call(app, path="/", query=b"", headers=(), method="GET"):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    async def run():
        try:
            await app(_scope(path, query, headers, method), receive, send)
        except Exception:
            pass

    asyncio.run(run())
    start = next((m for m in messages if m["type"] == "http.response.start"), None)
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start, body


def _header(start, name):
    for key, value in start["headers"]:
        if key.decode().lower() == name.lower():
            return value.decode()
    return None


def _build_app(registry):
    app = FastAPI()
    seen = {}

    @app.get("/product/{product_id}")
    def product(product_id: str, request: Request):
        seen["request_id"] = observability.get_request_id()
        seen["tenant_id"] = observability.get_tenant_id()
        seen["state_request_id"] = request.scope["state"]["request_id"]
        logging.getLogger("app.test.endpoint").info("loading %s", product_id)
        return {"id": product_id}

    @app.get("/boom")
    def boom():
        raise RuntimeError("kaboom")

    @app.get("/healthcheck")
    def healthcheck():
        return {"status": "ok"}

    app.add_middleware(ObservabilityMiddleware, metrics=registry)
    return app, seen


class _CaptureLogs:
    """Attach a JSON handler (with our context filter) to the root logger."""

    def __enter__(self):
        self.stream = io.StringIO()
        self.handler = logging.StreamHandler(self.stream)
        self.handler.addFilter(logs.RequestContextFilter())
        self.handler.setFormatter(logs.JsonFormatter())
        self.root = logging.getLogger()
        self.old_level = self.root.level
        self.root.addHandler(self.handler)
        self.root.setLevel(logging.INFO)
        return self

    def __exit__(self, *exc):
        self.root.removeHandler(self.handler)
        self.root.setLevel(self.old_level)

    def records(self):
        return [json.loads(line) for line in self.stream.getvalue().splitlines() if line.strip()]


class RequestIdTests(unittest.TestCase):
    def setUp(self):
        self.registry = RequestMetrics()
        self.app, self.seen = _build_app(self.registry)

    def test_valid_incoming_id_is_propagated_and_echoed(self):
        start, _ = _call(self.app, "/product/p1", headers=[(b"x-request-id", b"abc-123.XYZ:9")])
        self.assertEqual(start["status"], 200)
        self.assertEqual(_header(start, "X-Request-ID"), "abc-123.XYZ:9")
        self.assertEqual(self.seen["request_id"], "abc-123.XYZ:9")
        self.assertEqual(self.seen["state_request_id"], "abc-123.XYZ:9")

    def test_missing_id_is_generated(self):
        start, _ = _call(self.app, "/product/p1")
        generated = _header(start, "X-Request-ID")
        self.assertRegex(generated, r"^[0-9a-f]{32}$")
        self.assertEqual(self.seen["request_id"], generated)

    def test_invalid_or_oversized_ids_are_replaced(self):
        for bad in (b"has space", b"new\\nline", b"<script>", b"x" * 129, b"   "):
            start, _ = _call(self.app, "/product/p1", headers=[(b"x-request-id", bad)])
            echoed = _header(start, "X-Request-ID")
            self.assertNotEqual(echoed, bad.decode("latin-1"))
            self.assertRegex(echoed, r"^[0-9a-f]{32}$")

    def test_id_at_length_cap_is_accepted(self):
        value = "a" * context.MAX_REQUEST_ID_LENGTH
        self.assertEqual(context.valid_request_id(value), value)
        self.assertIsNone(context.valid_request_id(value + "a"))

    def test_context_is_cleared_after_request(self):
        _call(self.app, "/product/p1", query=b"tenantId=store1")
        self.assertIsNone(observability.get_request_id())
        self.assertIsNone(observability.get_tenant_id())

    def test_crash_response_still_carries_request_id(self):
        start, body = _call(self.app, "/boom", headers=[(b"x-request-id", b"crash-1")])
        self.assertEqual(start["status"], 500)
        self.assertEqual(_header(start, "X-Request-ID"), "crash-1")
        self.assertNotIn(b"kaboom", body)


class TenantAttributionTests(unittest.TestCase):
    def test_query_parameter(self):
        self.assertEqual(tenant_for_scope(_scope("/home", b"tenantId=Store-1")), "store-1")

    def test_verified_token_wins_over_query(self):
        token = jwt.encode({"tenantId": "owner-store", "role": "admin"}, SECRET_KEY, algorithm=ALGORITHM)
        scope = _scope("/orders", b"tenantId=other", [(b"authorization", f"Bearer {token}".encode())])
        self.assertEqual(tenant_for_scope(scope), "owner-store")

    def test_forged_token_is_ignored(self):
        token = jwt.encode({"tenantId": "victim"}, "not-the-secret", algorithm="HS256")
        scope = _scope("/orders", b"", [(b"authorization", f"Bearer {token}".encode())])
        self.assertIsNone(tenant_for_scope(scope))

    def test_slug_path(self):
        self.assertEqual(tenant_for_scope(_scope("/tenants/slug/My-Shop")), "my-shop")

    def test_hostile_values_are_neutralised(self):
        self.assertEqual(tenant_for_scope(_scope("/home", b"tenantId=%22%3E%3Cscript%3E")), "invalid")
        self.assertEqual(context.clean_tenant("a" * 80), "invalid")
        self.assertIsNone(context.clean_tenant("  "))


class LoggingTests(unittest.TestCase):
    def test_filter_adds_request_and_tenant(self):
        record = logging.LogRecord("x", logging.INFO, "f", 1, "hello", (), None)
        token_r = context.request_id_var.set("rid-1")
        token_t = context.tenant_id_var.set("store1")
        try:
            logs.RequestContextFilter().filter(record)
        finally:
            context.request_id_var.reset(token_r)
            context.tenant_id_var.reset(token_t)
        self.assertEqual(record.request_id, "rid-1")
        self.assertEqual(record.tenant_id, "store1")

    def test_filter_uses_dash_outside_requests(self):
        record = logging.LogRecord("x", logging.INFO, "f", 1, "hello", (), None)
        logs.RequestContextFilter().filter(record)
        self.assertEqual((record.request_id, record.tenant_id), ("-", "-"))

    def test_json_formatter_fields_extras_and_exception(self):
        try:
            raise ValueError("bad value")
        except ValueError:
            import sys

            exc_info = sys.exc_info()
        record = logging.LogRecord("app.x", logging.ERROR, "f", 1, "failed %s", ("thing",), exc_info)
        record.request_id = "rid-2"
        record.tenant_id = "-"
        record.order_id = "o1"
        line = logs.JsonFormatter().format(record)
        self.assertNotIn("\n", line)
        payload = json.loads(line)
        self.assertEqual(payload["level"], "ERROR")
        self.assertEqual(payload["logger"], "app.x")
        self.assertEqual(payload["message"], "failed thing")
        self.assertEqual(payload["request_id"], "rid-2")
        self.assertIsNone(payload["tenant_id"])
        self.assertEqual(payload["order_id"], "o1")
        self.assertIn("ValueError: bad value", payload["exception"])
        self.assertIn("T", payload["time"])

    def test_endpoint_logs_and_access_line_carry_context(self):
        registry = RequestMetrics()
        app, _ = _build_app(registry)
        with _CaptureLogs() as captured:
            _call(app, "/product/p9", query=b"tenantId=store9", headers=[(b"x-request-id", b"rid-9")])
            _call(app, "/healthcheck")
        records = captured.records()
        endpoint = [r for r in records if r["logger"] == "app.test.endpoint"]
        access = [r for r in records if r["logger"] == "app.access"]
        self.assertEqual(endpoint[0]["request_id"], "rid-9")
        self.assertEqual(endpoint[0]["tenant_id"], "store9")
        self.assertEqual(len(access), 1, "healthcheck must not produce an access line")
        line = access[0]
        self.assertEqual(line["http_method"], "GET")
        self.assertEqual(line["http_route"], "/product/{product_id}")
        self.assertEqual(line["http_status"], 200)
        self.assertEqual(line["tenant"], "store9")
        self.assertIsInstance(line["duration_ms"], float)

    def test_configure_logging_is_idempotent(self):
        root = logging.getLogger()
        before = list(root.handlers)
        level = root.level
        try:
            logs.configure_logging("text", "DEBUG")
            logs.configure_logging("text", "WARNING")
            ours = [h for h in root.handlers if getattr(h, logs._HANDLER_MARK, False)]
            self.assertEqual(len(ours), 1)
            self.assertEqual(root.level, logging.WARNING)
        finally:
            for handler in list(root.handlers):
                if handler not in before:
                    root.removeHandler(handler)
            root.setLevel(level)


class MetricsTests(unittest.TestCase):
    def test_counts_by_route_template_and_tenant(self):
        registry = RequestMetrics()
        app, _ = _build_app(registry)
        _call(app, "/product/a", query=b"tenantId=s1")
        _call(app, "/product/b", query=b"tenantId=s1")
        _call(app, "/boom", query=b"tenantId=s2")
        _call(app, "/no/such/path/123")
        _call(app, "/healthcheck")
        text = registry.render()
        self.assertIn(
            'http_requests_total{tenant="s1",route="/product/{product_id}",method="GET",status="2xx"} 2',
            text,
        )
        self.assertIn('http_request_errors_total{tenant="s2",route="/boom",method="GET"} 1', text)
        self.assertIn('route="unmatched"', text)
        self.assertNotIn("/product/a", text)
        self.assertNotIn("/no/such/path", text)
        self.assertNotIn("healthcheck", text)
        self.assertIn(
            'http_request_duration_seconds_count{tenant="s1",route="/product/{product_id}"} 2', text
        )
        self.assertIn('le="+Inf"', text)

    def test_histogram_buckets_are_cumulative(self):
        registry = RequestMetrics(buckets=(0.1, 1.0))
        registry.observe(tenant="t", route="/r", method="GET", status=200, duration_seconds=0.05)
        registry.observe(tenant="t", route="/r", method="GET", status=200, duration_seconds=0.5)
        registry.observe(tenant="t", route="/r", method="GET", status=200, duration_seconds=5)
        text = registry.render()
        self.assertIn('http_request_duration_seconds_bucket{tenant="t",route="/r",le="0.1"} 1', text)
        self.assertIn('http_request_duration_seconds_bucket{tenant="t",route="/r",le="1"} 2', text)
        self.assertIn('http_request_duration_seconds_bucket{tenant="t",route="/r",le="+Inf"} 3', text)

    def test_tenant_cardinality_is_capped(self):
        registry = RequestMetrics(max_tenants=2)
        for tenant in ("a", "b", "c", "d", "a"):
            registry.observe(tenant=tenant, route="/r", method="GET", status=200, duration_seconds=0.01)
        text = registry.render()
        self.assertIn('tenant="a"', text)
        self.assertIn('tenant="b"', text)
        self.assertNotIn('tenant="c"', text)
        self.assertIn('http_requests_total{tenant="other",route="/r",method="GET",status="2xx"} 2', text)
        self.assertIn("metrics_tenants_tracked 2", text)

    def test_label_values_are_escaped(self):
        registry = RequestMetrics()
        registry.observe(tenant=None, route='/a"b\\c', method="GET", status=200, duration_seconds=0)
        self.assertIn('route="/a\\"b\\\\c"', registry.render())


class MetricsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(metrics.router)

    def test_404_when_token_unset(self):
        with patch.object(metrics.settings, "METRICS_TOKEN", ""):
            start, _ = _call(self.app, "/metrics", headers=[(b"authorization", b"Bearer anything")])
        self.assertEqual(start["status"], 404)

    def test_401_without_or_with_wrong_token(self):
        with patch.object(metrics.settings, "METRICS_TOKEN", "s3cret"):
            missing, _ = _call(self.app, "/metrics")
            wrong, _ = _call(self.app, "/metrics", headers=[(b"authorization", b"Bearer nope")])
            basic, _ = _call(self.app, "/metrics", headers=[(b"authorization", b"Basic s3cret")])
        self.assertEqual(missing["status"], 401)
        self.assertEqual(wrong["status"], 401)
        self.assertEqual(basic["status"], 401)

    def test_prometheus_text_with_right_token(self):
        with patch.object(metrics.settings, "METRICS_TOKEN", "s3cret"):
            start, body = _call(self.app, "/metrics", headers=[(b"authorization", b"Bearer s3cret")])
        self.assertEqual(start["status"], 200)
        self.assertTrue(_header(start, "content-type").startswith("text/plain; version=0.0.4"))
        self.assertIn(b"# TYPE http_requests_total counter", body)


class ScrubbingTests(unittest.TestCase):
    def test_sensitive_keys(self):
        for key in (
            "password", "newPassword", "otp", "signupOtp", "OTP", "token", "resetToken",
            "Authorization", "Cookie", "X-Razorpay-Signature", "razorpay_signature",
            "x-api-key", "apiToken", "SECRET_KEY", "x-periskope-signature",
        ):
            self.assertTrue(scrubbing.is_sensitive_key(key), key)
        for key in ("tenantId", "couponCode", "pincode", "hotpink", "notPaid", "footer", "author", "orderId"):
            self.assertFalse(scrubbing.is_sensitive_key(key), key)

    def test_nested_values_and_header_pairs(self):
        event = {
            "request": {
                "headers": {"Authorization": "Bearer abc", "X-Razorpay-Signature": "sig", "Accept": "json"},
                "cookies": {"session": "x"},
                "query_string": "token=abc&tenantId=t1",
                "data": {"password": "hunter2"},
            },
            "extra": {"payload": {"otp": "123456", "items": [{"cardNumber": "4111"}]}},
            "breadcrumbs": {"values": [{"data": {"url": "https://x/reset?token=abc&a=1"}}]},
            "exception": {"values": [{"value": "failed for Bearer eyJhbGciOi.eyJzdWIi.c2ln"}]},
            "pairs": [["authorization", "Bearer x"], ["accept", "json"]],
        }
        cleaned = scrubbing.scrub_event(event)
        headers = cleaned["request"]["headers"]
        self.assertEqual(headers["Authorization"], "[Filtered]")
        self.assertEqual(headers["X-Razorpay-Signature"], "[Filtered]")
        self.assertEqual(headers["Accept"], "json")
        self.assertEqual(cleaned["request"]["cookies"], "[Filtered]")
        self.assertIn("token=[Filtered]", cleaned["request"]["query_string"])
        self.assertIn("tenantId=t1", cleaned["request"]["query_string"])
        self.assertEqual(cleaned["request"]["data"], "[Filtered]")
        self.assertEqual(cleaned["extra"]["payload"]["otp"], "[Filtered]")
        self.assertEqual(cleaned["extra"]["payload"]["items"][0]["cardNumber"], "[Filtered]")
        self.assertEqual(
            cleaned["breadcrumbs"]["values"][0]["data"]["url"], "https://x/reset?token=[Filtered]&a=1"
        )
        self.assertNotIn("eyJ", cleaned["exception"]["values"][0]["value"])
        self.assertEqual(cleaned["pairs"][0], ["authorization", "[Filtered]"])
        self.assertEqual(cleaned["pairs"][1], ["accept", "json"])
        # Original is untouched.
        self.assertEqual(event["request"]["headers"]["Authorization"], "Bearer abc")

    def test_before_send_tags_and_scrubs(self):
        token_r = context.request_id_var.set("rid-5")
        token_t = context.tenant_id_var.set("store5")
        try:
            event = sentry_module.before_send({"extra": {"password": "p"}}, {})
        finally:
            context.request_id_var.reset(token_r)
            context.tenant_id_var.reset(token_t)
        self.assertEqual(event["tags"]["request_id"], "rid-5")
        self.assertEqual(event["tags"]["tenant_id"], "store5")
        self.assertEqual(event["extra"]["password"], "[Filtered]")


class SentryGatingTests(unittest.TestCase):
    def tearDown(self):
        sentry_module._enabled = False

    def test_no_init_when_dsn_empty(self):
        with patch("sentry_sdk.init") as init:
            self.assertFalse(sentry_module.init_sentry(""))
            with patch.object(sentry_module.settings, "SENTRY_DSN", ""):
                self.assertFalse(sentry_module.init_sentry())
        init.assert_not_called()
        self.assertFalse(observability.sentry_enabled())

    def test_init_with_dsn_uses_scrubbing_and_no_pii(self):
        with patch("sentry_sdk.init") as init:
            self.assertTrue(
                sentry_module.init_sentry(
                    "https://public@example.invalid/1", environment="test", traces_sample_rate=0.25
                )
            )
        kwargs = init.call_args.kwargs
        self.assertEqual(kwargs["environment"], "test")
        self.assertEqual(kwargs["traces_sample_rate"], 0.25)
        self.assertFalse(kwargs["send_default_pii"])
        self.assertEqual(kwargs["max_request_body_size"], "never")
        self.assertIs(kwargs["before_send"], sentry_module.before_send)
        names = {type(i).__name__ for i in kwargs["integrations"]}
        self.assertIn("FastApiIntegration", names)

    def test_settings_defaults(self):
        from app.observability import settings

        with patch.dict("os.environ", {}, clear=False):
            self.assertEqual(settings._float("DOES_NOT_EXIST_X", 0.1), 0.1)
        with patch.dict("os.environ", {"X_RATE": "5"}):
            self.assertEqual(settings._float("X_RATE", 0.1), 1.0)
        with patch.dict("os.environ", {"X_RATE": "junk"}):
            self.assertEqual(settings._float("X_RATE", 0.1), 0.1)


class AlertTests(unittest.TestCase):
    def tearDown(self):
        sentry_module._enabled = False

    def test_logs_error_with_context_and_skips_sentry_when_off(self):
        sentry_module._enabled = False
        with patch("sentry_sdk.capture_message") as capture, self.assertLogs("app.alerts", "ERROR") as captured:
            alerts.alert("whatsapp.send_failed", tenant_id="Store1", order_id="o1", otp="1234")
        capture.assert_not_called()
        record = captured.records[0]
        self.assertEqual(record.levelno, logging.ERROR)
        self.assertEqual(record.alert, "whatsapp.send_failed")
        self.assertEqual(record.alert_context["tenant_id"], "store1")
        self.assertEqual(record.alert_context["order_id"], "o1")
        self.assertEqual(record.alert_context["otp"], "[Filtered]")
        self.assertNotIn("1234", record.getMessage())

    def test_error_attributes_are_extracted(self):
        class ProviderError(Exception):
            code = "NETWORK"
            status_code = 502

        with self.assertLogs("app.alerts", "ERROR") as captured:
            alerts.alert("delhivery.request_failed", error=ProviderError("down"))
        ctx = captured.records[0].alert_context
        self.assertEqual(ctx["error_type"], "ProviderError")
        self.assertEqual(ctx["error_message"], "down")
        self.assertEqual(ctx["code"], "NETWORK")
        self.assertEqual(ctx["http_status"], 502)

    def test_sends_tagged_sentry_message_when_on(self):
        sentry_module._enabled = True
        scope = MagicMock()
        scope_cm = MagicMock()
        scope_cm.__enter__.return_value = scope
        token = context.request_id_var.set("rid-7")
        try:
            with patch("sentry_sdk.new_scope", return_value=scope_cm), patch(
                "sentry_sdk.capture_message"
            ) as capture, self.assertLogs("app.alerts", "ERROR"):
                alerts.alert("razorpay.webhook_failed", provider="razorpay", tenant_id="s1")
        finally:
            context.request_id_var.reset(token)
        capture.assert_called_once_with("alert: razorpay.webhook_failed", level="error")
        tags = {call.args[0]: call.args[1] for call in scope.set_tag.call_args_list}
        self.assertEqual(tags["alert"], "razorpay.webhook_failed")
        self.assertEqual(tags["tenant_id"], "s1")
        self.assertEqual(tags["request_id"], "rid-7")
        self.assertEqual(tags["provider"], "razorpay")
        self.assertEqual(scope.fingerprint, ["alert", "razorpay.webhook_failed"])

    def test_alert_never_raises(self):
        with patch.object(alerts, "_alert", side_effect=RuntimeError("broken")), self.assertLogs(
            "app.observability.alerts", "ERROR"
        ):
            alerts.alert("x")

    def test_alert_on_error_decorator(self):
        @alerts.alert_on_error("billing.webhook_failed", provider="razorpay")
        def handler(payload):
            if payload == "bad":
                raise ValueError("nope")
            return "ok"

        with self.assertNoLogs("app.alerts", "ERROR"):
            self.assertEqual(handler("good"), "ok")
        with self.assertLogs("app.alerts", "ERROR") as captured, self.assertRaises(ValueError):
            handler("bad")
        ctx = captured.records[0].alert_context
        self.assertEqual(captured.records[0].alert, "billing.webhook_failed")
        self.assertEqual(ctx["provider"], "razorpay")
        self.assertEqual(ctx["error_type"], "ValueError")


if __name__ == "__main__":
    unittest.main()
