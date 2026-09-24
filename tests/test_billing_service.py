import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.services import billing_service


class FakeTenants:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.updates = []

    def _match(self, doc, query):
        for key, expected in query.items():
            if key == "deletedAt":
                continue
            if isinstance(expected, dict) and "$regex" in expected:
                if str(doc.get(key, "")).lower() != expected["$regex"].strip("^$").replace("\\", "").lower():
                    return False
                continue
            value = doc
            for part in key.split("."):
                value = value.get(part) if isinstance(value, dict) else None
            if value != expected:
                return False
        return True

    def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._match(doc, query):
                return doc
        return None

    def update_one(self, query, update):
        self.updates.append(update)
        for doc in self.docs:
            if doc.get("_id") == query.get("_id"):
                for key, value in update.get("$set", {}).items():
                    target = doc
                    parts = key.split(".")
                    for part in parts[:-1]:
                        target = target.setdefault(part, {})
                    target[parts[-1]] = value


NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)


def _tenant(**billing):
    return {"_id": ObjectId(), "tenantId": "store-1", "billing": billing}


class AddMonthsTests(unittest.TestCase):
    def test_plain_three_months(self):
        start = datetime(2026, 1, 15, tzinfo=timezone.utc)
        self.assertEqual(billing_service.add_months(start, 3), datetime(2026, 4, 15, tzinfo=timezone.utc))

    def test_clamps_to_end_of_short_month(self):
        start = datetime(2026, 11, 30, tzinfo=timezone.utc)
        # Nov 30 + 3 months -> Feb 28 (2027 is not a leap year).
        self.assertEqual(billing_service.add_months(start, 3), datetime(2027, 2, 28, tzinfo=timezone.utc))

    def test_rolls_over_year(self):
        start = datetime(2026, 12, 1, tzinfo=timezone.utc)
        self.assertEqual(billing_service.add_months(start, 3), datetime(2027, 3, 1, tzinfo=timezone.utc))


class NewTrialTests(unittest.TestCase):
    def test_new_store_gets_three_month_trial(self):
        with patch.object(billing_service, "TRIAL_MONTHS", 3):
            billing = billing_service.new_trial_billing(NOW)
        self.assertEqual(billing["status"], "trialing")
        self.assertEqual(billing["trialEndsAt"], datetime(2026, 12, 23, 12, 0, tzinfo=timezone.utc))


class LifecycleTests(unittest.TestCase):
    def _run(self, tenant, now):
        fake = FakeTenants([tenant])
        with patch.object(billing_service, "tenants", fake), patch.object(
            billing_service, "SUBSCRIPTION_GRACE_DAYS", 7
        ):
            return billing_service.ensure_billing_status_current(tenant, now), fake

    def test_grandfathered_store_without_billing_is_exempt_and_never_written(self):
        tenant = {"_id": ObjectId(), "tenantId": "old-store"}
        billing, fake = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "exempt")
        self.assertTrue(billing_service.is_store_operational(tenant))
        self.assertEqual(fake.updates, [])

    def test_trial_still_running(self):
        tenant = _tenant(status="trialing", trialEndsAt=NOW + timedelta(days=10))
        billing, fake = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "trialing")
        self.assertEqual(fake.updates, [])

    def test_trial_ended_enters_grace_with_deadline_fixed_to_trial_end(self):
        trial_end = NOW - timedelta(days=2)
        tenant = _tenant(status="trialing", trialEndsAt=trial_end)
        billing, fake = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "past_due")
        # Grace is measured from when the trial ended, not from "now".
        self.assertEqual(billing["graceEndsAt"], trial_end + timedelta(days=7))
        self.assertEqual(tenant["billing"]["status"], "past_due")  # persisted

    def test_grace_deadline_is_stable_across_repeated_checks(self):
        tenant = _tenant(status="trialing", trialEndsAt=NOW - timedelta(days=2))
        first, _ = self._run(tenant, NOW)
        second, _ = self._run(tenant, NOW + timedelta(hours=5))
        self.assertEqual(first["graceEndsAt"], second["graceEndsAt"])

    def test_store_checked_long_after_trial_goes_straight_to_suspended(self):
        tenant = _tenant(status="trialing", trialEndsAt=NOW - timedelta(days=30))
        billing, _ = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "suspended")

    def test_past_due_within_grace_is_still_operational(self):
        tenant = _tenant(status="past_due", graceEndsAt=NOW + timedelta(days=3))
        billing, _ = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "past_due")

    def test_past_due_after_grace_is_suspended(self):
        tenant = _tenant(status="past_due", graceEndsAt=NOW - timedelta(minutes=1))
        billing, _ = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "suspended")

    def test_active_period_lapsed_without_renewal_enters_grace(self):
        period_end = NOW - timedelta(days=1)
        tenant = _tenant(status="active", currentPeriodEnd=period_end)
        billing, _ = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "past_due")
        self.assertEqual(billing["graceEndsAt"], period_end + timedelta(days=7))

    def test_active_within_period_stays_active(self):
        tenant = _tenant(status="active", currentPeriodEnd=NOW + timedelta(days=20))
        billing, fake = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "active")
        self.assertEqual(fake.updates, [])

    def test_exempt_status_never_transitions(self):
        tenant = _tenant(status="exempt", trialEndsAt=NOW - timedelta(days=365))
        billing, _ = self._run(tenant, NOW)
        self.assertEqual(billing["status"], "exempt")


class AssertOperationalTests(unittest.TestCase):
    def test_suspended_store_raises_402(self):
        tenant = _tenant(status="suspended")
        with patch.object(billing_service, "tenants", FakeTenants([tenant])):
            with self.assertRaises(HTTPException) as context:
                billing_service.assert_store_operational(tenant)
        self.assertEqual(context.exception.status_code, 402)

    def test_missing_tenant_does_not_raise(self):
        billing_service.assert_store_operational(None)


class SubscriptionWebhookTests(unittest.TestCase):
    def _event(self, event, **entity):
        return {
            "event": event,
            "payload": {"subscription": {"entity": {"id": "sub_123", **entity}}},
        }

    def _tenant(self, **billing):
        return {
            "_id": ObjectId(),
            "tenantId": "store-1",
            "billing": {"razorpaySubscriptionId": "sub_123", **billing},
        }

    def _apply(self, tenant, payload):
        fake = FakeTenants([tenant])
        with patch.object(billing_service, "tenants", fake), patch.object(
            billing_service, "SUBSCRIPTION_GRACE_DAYS", 7
        ):
            return billing_service.handle_subscription_event(payload)

    def test_charge_activates_and_clears_grace(self):
        period_end = int((NOW + timedelta(days=30)).timestamp())
        tenant = self._tenant(status="past_due", graceEndsAt=NOW)
        result = self._apply(tenant, self._event("subscription.charged", current_end=period_end))
        self.assertEqual(result["status"], "processed")
        self.assertEqual(tenant["billing"]["status"], "active")
        self.assertIsNone(tenant["billing"]["graceEndsAt"])
        self.assertEqual(
            tenant["billing"]["currentPeriodEnd"],
            datetime.fromtimestamp(period_end, timezone.utc),
        )

    def test_charge_reactivates_a_suspended_store(self):
        tenant = self._tenant(status="suspended")
        self._apply(tenant, self._event("subscription.charged", current_end=int(NOW.timestamp()) + 86400))
        self.assertEqual(tenant["billing"]["status"], "active")

    def test_authenticated_during_trial_only_records_autopay(self):
        tenant = self._tenant(status="trialing")
        self._apply(tenant, self._event("subscription.authenticated"))
        self.assertTrue(tenant["billing"]["autopaySetUp"])
        self.assertEqual(tenant["billing"]["status"], "trialing")  # trial untouched

    def test_failed_charge_does_not_push_back_existing_grace_deadline(self):
        existing_deadline = NOW + timedelta(days=2)
        tenant = self._tenant(status="past_due", graceEndsAt=existing_deadline)
        self._apply(tenant, self._event("subscription.pending"))
        self.assertEqual(tenant["billing"]["graceEndsAt"], existing_deadline)

    def test_failed_charge_does_not_revive_a_suspended_store(self):
        tenant = self._tenant(status="suspended")
        self._apply(tenant, self._event("subscription.halted"))
        self.assertEqual(tenant["billing"]["status"], "suspended")

    def test_cancel_keeps_paid_period(self):
        tenant = self._tenant(status="active", currentPeriodEnd=NOW + timedelta(days=10))
        self._apply(tenant, self._event("subscription.cancelled"))
        self.assertEqual(tenant["billing"]["status"], "active")
        self.assertIsNotNone(tenant["billing"]["cancelledAt"])

    def test_charge_on_exempt_store_does_not_change_status(self):
        tenant = self._tenant(status="exempt")
        self._apply(tenant, self._event("subscription.charged", current_end=int(NOW.timestamp())))
        self.assertEqual(tenant["billing"]["status"], "exempt")

    def test_unknown_subscription_is_ignored(self):
        fake = FakeTenants([])
        with patch.object(billing_service, "tenants", fake):
            result = billing_service.handle_subscription_event(self._event("subscription.charged"))
        self.assertEqual(result["status"], "ignored")


class CreateSubscriptionTests(unittest.TestCase):
    def test_not_configured_returns_503(self):
        with patch.object(billing_service, "RAZORPAY_SUBSCRIPTION_PLAN_ID", None):
            with self.assertRaises(HTTPException) as context:
                billing_service.create_subscription_for_tenant("store-1")
        self.assertEqual(context.exception.status_code, 503)

    def test_subscribing_during_trial_defers_first_charge_to_trial_end(self):
        trial_end = datetime.now(timezone.utc) + timedelta(days=40)
        tenant = _tenant(status="trialing", trialEndsAt=trial_end)
        fake = FakeTenants([tenant])
        fake_client = MagicMock()
        fake_client.subscription.create.return_value = {
            "id": "sub_new",
            "short_url": "https://rzp.io/i/abc",
            "status": "created",
        }
        with patch.object(billing_service, "RAZORPAY_SUBSCRIPTION_PLAN_ID", "plan_x"), patch.object(
            billing_service, "tenants", fake
        ), patch.object(billing_service, "client", fake_client):
            result = billing_service.create_subscription_for_tenant("store-1")

        sent = fake_client.subscription.create.call_args[0][0]
        self.assertEqual(sent["start_at"], int(trial_end.timestamp()))
        self.assertEqual(sent["plan_id"], "plan_x")
        self.assertEqual(result["shortUrl"], "https://rzp.io/i/abc")
        self.assertEqual(tenant["billing"]["razorpaySubscriptionId"], "sub_new")

    def test_subscribing_after_trial_charges_immediately(self):
        tenant = _tenant(status="past_due", graceEndsAt=datetime.now(timezone.utc) + timedelta(days=3))
        fake_client = MagicMock()
        fake_client.subscription.create.return_value = {"id": "sub_new", "short_url": "u"}
        with patch.object(billing_service, "RAZORPAY_SUBSCRIPTION_PLAN_ID", "plan_x"), patch.object(
            billing_service, "tenants", FakeTenants([tenant])
        ), patch.object(billing_service, "client", fake_client):
            billing_service.create_subscription_for_tenant("store-1")
        self.assertNotIn("start_at", fake_client.subscription.create.call_args[0][0])

    def test_reuses_pending_subscription_instead_of_creating_duplicates(self):
        tenant = _tenant(
            status="trialing",
            trialEndsAt=datetime.now(timezone.utc) + timedelta(days=40),
            razorpaySubscriptionId="sub_existing",
        )
        fake_client = MagicMock()
        fake_client.subscription.fetch.return_value = {"status": "created", "short_url": "old_url"}
        with patch.object(billing_service, "RAZORPAY_SUBSCRIPTION_PLAN_ID", "plan_x"), patch.object(
            billing_service, "tenants", FakeTenants([tenant])
        ), patch.object(billing_service, "client", fake_client):
            result = billing_service.create_subscription_for_tenant("store-1")
        fake_client.subscription.create.assert_not_called()
        self.assertEqual(result["subscriptionId"], "sub_existing")

    def test_exempt_store_cannot_subscribe(self):
        tenant = _tenant(status="exempt")
        with patch.object(billing_service, "RAZORPAY_SUBSCRIPTION_PLAN_ID", "plan_x"), patch.object(
            billing_service, "tenants", FakeTenants([tenant])
        ):
            with self.assertRaises(HTTPException) as context:
                billing_service.create_subscription_for_tenant("store-1")
        self.assertEqual(context.exception.status_code, 400)


class ExemptToggleTests(unittest.TestCase):
    def test_removing_exemption_starts_grace_not_a_new_trial(self):
        tenant = _tenant(status="exempt", trialEndsAt=NOW - timedelta(days=200))
        with patch.object(billing_service, "tenants", FakeTenants([tenant])), patch.object(
            billing_service, "SUBSCRIPTION_GRACE_DAYS", 7
        ):
            summary = billing_service.set_billing_exempt("store-1", False)
        self.assertEqual(summary["status"], "past_due")
        self.assertIsNotNone(tenant["billing"]["graceEndsAt"])


if __name__ == "__main__":
    unittest.main()
