import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from bson import ObjectId
from fastapi import HTTPException

from app.services.periskope_service import PeriskopeError
from app.services.store_signup_otp_service import (
    MAX_ATTEMPTS,
    consume_store_signup_otp,
    hash_store_otp,
    send_store_signup_otp,
)

PHONE = "9876543210"
PHONE_E164 = "919876543210"


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find_one(self, query, sort=None):
        matches = [doc for doc in self.docs if _matches(doc, query)]
        if sort:
            field, direction = sort[0]
            matches.sort(key=lambda doc: doc.get(field), reverse=direction < 0)
        return dict(matches[0]) if matches else None

    def count_documents(self, query):
        return sum(1 for doc in self.docs if _matches(doc, query))

    def insert_one(self, document):
        stored = dict(document)
        stored["_id"] = ObjectId()
        self.docs.append(stored)
        return SimpleNamespace(inserted_id=stored["_id"])

    def update_one(self, query, update):
        for doc in self.docs:
            if _matches(doc, query):
                if "$inc" in update:
                    for key, value in update["$inc"].items():
                        doc[key] = int(doc.get(key) or 0) + value
                if "$set" in update:
                    doc.update(update["$set"])
                return
        return

    def delete_one(self, query):
        self.docs[:] = [doc for doc in self.docs if not _matches(doc, query)]


def _matches(doc, query):
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$gte" in expected and not (actual and actual >= expected["$gte"]):
                return False
            continue
        if actual != expected:
            return False
    return True


class StoreSignupOtpTests(unittest.TestCase):
    def setUp(self):
        self.otps = FakeCollection()
        self.tenants = FakeCollection()
        self.whatsapp_patch = patch(
            "app.services.store_signup_otp_service.send_store_otp_whatsapp",
        )
        self.otp_coll_patch = patch(
            "app.services.store_signup_otp_service.store_signup_otps",
            self.otps,
        )
        self.tenant_coll_patch = patch(
            "app.services.store_signup_otp_service.tenants",
            self.tenants,
        )
        self.send_whatsapp = self.whatsapp_patch.start()
        self.otp_coll_patch.start()
        self.tenant_coll_patch.start()

    def tearDown(self):
        self.whatsapp_patch.stop()
        self.otp_coll_patch.stop()
        self.tenant_coll_patch.stop()

    def test_send_then_consume_succeeds(self):
        result = send_store_signup_otp("Owner@Store.com", PHONE)
        self.assertTrue(result["success"])
        self.assertIn("WhatsApp", result["message"])
        code = self.send_whatsapp.call_args[0][1]
        self.assertEqual(self.send_whatsapp.call_args[0][0], PHONE_E164)
        consume_store_signup_otp("owner@store.com", code, PHONE)
        self.assertIsNotNone(self.otps.docs[0]["consumedAt"])

    def test_wrong_code_is_rejected(self):
        send_store_signup_otp("owner@store.com", PHONE)
        with self.assertRaises(HTTPException) as error:
            consume_store_signup_otp("owner@store.com", "000000", PHONE)
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.otps.docs[0]["attempts"], 1)

    def test_existing_tenant_email_blocked(self):
        self.tenants.docs.append({"email": "owner@store.com"})
        with self.assertRaises(HTTPException) as error:
            send_store_signup_otp("owner@store.com", PHONE)
        self.assertIn("already used", error.exception.detail)

    def test_expired_code_rejected(self):
        send_store_signup_otp("owner@store.com", PHONE)
        self.otps.docs[0]["expiresAt"] = datetime.now(timezone.utc) - timedelta(minutes=1)
        code = self.send_whatsapp.call_args[0][1]
        with self.assertRaises(HTTPException) as error:
            consume_store_signup_otp("owner@store.com", code, PHONE)
        self.assertIn("expired", error.exception.detail)

    def test_too_many_attempts_blocked(self):
        send_store_signup_otp("owner@store.com", PHONE)
        self.otps.docs[0]["attempts"] = MAX_ATTEMPTS
        with self.assertRaises(HTTPException) as error:
            consume_store_signup_otp("owner@store.com", "123456", PHONE)
        self.assertIn("Too many", error.exception.detail)

    def test_whatsapp_failure_keeps_otp_in_development(self):
        self.send_whatsapp.side_effect = PeriskopeError(
            "not configured",
            code="NOT_CONFIGURED",
        )
        result = send_store_signup_otp("owner@store.com", PHONE)
        self.assertTrue(result["success"])
        self.assertIn("API terminal", result["message"])
        self.assertEqual(len(self.otps.docs), 1)
        self.assertIsNone(self.otps.docs[0]["consumedAt"])

    def test_hash_is_phone_scoped(self):
        self.assertNotEqual(
            hash_store_otp("a@b.com", "123456", "919111111111"),
            hash_store_otp("a@b.com", "123456", "919222222222"),
        )
