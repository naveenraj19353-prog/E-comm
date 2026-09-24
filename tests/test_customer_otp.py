import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException
from jose import jwt
from pymongo.errors import DuplicateKeyError

from app.models.user import CustomerOtpSendRequest, CustomerOtpVerifyRequest
from app.routes import auth as auth_routes
from app.services import customer_otp_service as otp
from app.services.periskope_service import PeriskopeError
from app.utils.auth_dependencies import require_customer
from app.utils.jwt_handler import ALGORITHM, SECRET_KEY

TENANT = "shop-a"
PHONE = "9876543210"
PHONE_E164 = "919876543210"


def _matches(doc, query):
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$gte" in expected and not (actual is not None and actual >= expected["$gte"]):
                return False
            if "$exists" in expected and (key in doc) != expected["$exists"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            continue
        if actual != expected:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None, unique=None):
        self.docs = list(docs or [])
        self.unique = unique or []

    def find_one(self, query, projection=None, sort=None):
        matches = [doc for doc in self.docs if _matches(doc, query)]
        if sort:
            field, direction = sort[0]
            matches.sort(key=lambda doc: doc.get(field), reverse=direction < 0)
        return dict(matches[0]) if matches else None

    def count_documents(self, query):
        return sum(1 for doc in self.docs if _matches(doc, query))

    def insert_one(self, document):
        for fields in self.unique:
            if all(document.get(f) for f in fields) and any(
                all(doc.get(f) == document.get(f) for f in fields) for doc in self.docs
            ):
                raise DuplicateKeyError("duplicate key")
        stored = dict(document)
        stored["_id"] = ObjectId()
        self.docs.append(stored)
        return SimpleNamespace(inserted_id=stored["_id"])

    def update_one(self, query, update):
        for doc in self.docs:
            if _matches(doc, query):
                for key, value in update.get("$inc", {}).items():
                    doc[key] = int(doc.get(key) or 0) + value
                doc.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)

    def delete_one(self, query):
        self.docs[:] = [doc for doc in self.docs if not _matches(doc, query)]


class _OtpTestCase(unittest.TestCase):
    def setUp(self):
        self.otps = FakeCollection()
        self.tenants = FakeCollection([
            {"_id": ObjectId(), "tenantId": TENANT, "name": "Shop A", "isActive": True},
        ])
        self.users = FakeCollection(unique=[("tenantId", "phone")])
        self.patches = [
            patch.object(otp, "customer_otps", self.otps),
            patch.object(otp, "tenants", self.tenants),
            patch.object(otp, "users", self.users),
            patch.object(otp, "is_store_operational", return_value=True),
        ]
        for item in self.patches:
            item.start()
        self.whatsapp_patch = patch.object(otp, "send_customer_otp_whatsapp")
        self.send_whatsapp = self.whatsapp_patch.start()

    def tearDown(self):
        self.whatsapp_patch.stop()
        for item in reversed(self.patches):
            item.stop()

    def sent_code(self):
        return self.send_whatsapp.call_args[0][1]


class CustomerOtpServiceTests(_OtpTestCase):
    def test_send_stores_only_a_hash_and_normalized_phone(self):
        result = otp.send_customer_otp("Shop-A", PHONE)
        self.assertTrue(result["success"])
        self.assertEqual(self.send_whatsapp.call_args[0][0], PHONE_E164)
        code = self.sent_code()
        self.assertEqual(len(code), 6)
        record = self.otps.docs[0]
        self.assertEqual(record["tenantId"], TENANT)
        self.assertEqual(record["phone"], PHONE_E164)
        self.assertNotIn(code, str(record))
        self.assertEqual(record["codeHash"], otp.hash_customer_otp(TENANT, PHONE_E164, code))
        self.assertAlmostEqual(
            (record["expiresAt"] - record["createdAt"]).total_seconds(), 600, delta=1,
        )

    def test_send_then_consume_succeeds_once(self):
        otp.send_customer_otp(TENANT, PHONE)
        code = self.sent_code()
        otp.consume_customer_otp(TENANT, "+91 98765 43210", code)
        self.assertIsNotNone(self.otps.docs[0]["consumedAt"])
        with self.assertRaises(HTTPException):
            otp.consume_customer_otp(TENANT, PHONE, code)

    def test_hash_is_scoped_to_store_and_phone(self):
        base = otp.hash_customer_otp(TENANT, PHONE_E164, "123456")
        self.assertNotEqual(base, otp.hash_customer_otp("shop-b", PHONE_E164, "123456"))
        self.assertNotEqual(base, otp.hash_customer_otp(TENANT, "919111111111", "123456"))

    def test_code_for_one_store_does_not_work_on_another(self):
        self.tenants.docs.append({"tenantId": "shop-b", "name": "B", "isActive": True})
        otp.send_customer_otp(TENANT, PHONE)
        with self.assertRaises(HTTPException) as error:
            otp.consume_customer_otp("shop-b", PHONE, self.sent_code())
        self.assertIn("Request a code", error.exception.detail)

    def test_wrong_code_counts_an_attempt(self):
        otp.send_customer_otp(TENANT, PHONE)
        with self.assertRaises(HTTPException) as error:
            otp.consume_customer_otp(TENANT, PHONE, "000000" if self.sent_code() != "000000" else "111111")
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.otps.docs[0]["attempts"], 1)

    def test_too_many_attempts_blocks_even_the_right_code(self):
        otp.send_customer_otp(TENANT, PHONE)
        self.otps.docs[0]["attempts"] = otp.MAX_ATTEMPTS
        with self.assertRaises(HTTPException) as error:
            otp.consume_customer_otp(TENANT, PHONE, self.sent_code())
        self.assertIn("Too many", error.exception.detail)

    def test_expired_code_rejected(self):
        otp.send_customer_otp(TENANT, PHONE)
        self.otps.docs[0]["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        with self.assertRaises(HTTPException) as error:
            otp.consume_customer_otp(TENANT, PHONE, self.sent_code())
        self.assertIn("expired", error.exception.detail)

    def test_resend_cooldown(self):
        otp.send_customer_otp(TENANT, PHONE)
        with self.assertRaises(HTTPException) as error:
            otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 429)
        self.assertIn("seconds", error.exception.detail)
        self.otps.docs[0]["createdAt"] -= timedelta(seconds=otp.RESEND_SECONDS + 1)
        otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(len(self.otps.docs), 2)

    def test_hourly_send_limit(self):
        now = datetime.now(timezone.utc)
        for minutes in range(otp.MAX_SENDS_PER_HOUR):
            self.otps.docs.append({
                "tenantId": TENANT, "phone": PHONE_E164,
                "createdAt": now - timedelta(minutes=5 + minutes),
            })
        with self.assertRaises(HTTPException) as error:
            otp.send_customer_otp(TENANT, PHONE)
        self.assertIn("Too many", error.exception.detail)

    def test_inactive_or_deleted_store_refused(self):
        self.tenants.docs[0]["isActive"] = False
        with self.assertRaises(HTTPException) as error:
            otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 404)
        self.tenants.docs[0]["isActive"] = True
        self.tenants.docs[0]["deletedAt"] = datetime.now(timezone.utc)
        with self.assertRaises(HTTPException) as error:
            otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 404)
        self.send_whatsapp.assert_not_called()

    def test_suspended_store_refused(self):
        with patch.object(otp, "is_store_operational", return_value=False):
            with self.assertRaises(HTTPException) as error:
                otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 402)
        self.send_whatsapp.assert_not_called()

    def test_invalid_phone_rejected(self):
        with self.assertRaises(HTTPException) as error:
            otp.send_customer_otp(TENANT, "12345")
        self.assertEqual(error.exception.status_code, 400)

    def test_whatsapp_failure_logs_code_outside_production(self):
        self.send_whatsapp.side_effect = PeriskopeError("nope", code="NOT_CONFIGURED")
        with patch.object(otp, "IS_PRODUCTION", False):
            result = otp.send_customer_otp(TENANT, PHONE)
        self.assertIn("API terminal", result["message"])
        self.assertEqual(len(self.otps.docs), 1)

    def test_whatsapp_failure_in_production_drops_the_code(self):
        self.send_whatsapp.side_effect = PeriskopeError("nope", code="SEND_FAILED")
        with patch.object(otp, "IS_PRODUCTION", True):
            with self.assertRaises(HTTPException) as error:
                otp.send_customer_otp(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(self.otps.docs, [])


class FindOrCreateCustomerTests(_OtpTestCase):
    def test_creates_phone_customer_without_usable_password(self):
        customer, created = otp.find_or_create_phone_customer(TENANT, PHONE, "  Asha  K ")
        self.assertTrue(created)
        self.assertEqual(customer["phone"], PHONE_E164)
        self.assertEqual(customer["role"], "customer")
        self.assertEqual(customer["authChannel"], "phone")
        self.assertEqual(customer["name"], "Asha K")
        self.assertNotIn("email", customer)
        self.assertTrue(customer["password"])
        self.assertFalse(customer["passwordSet"])

    def test_reuses_existing_customer_stored_in_another_format(self):
        existing_id = ObjectId()
        self.users.docs.append({
            "_id": existing_id, "tenantId": TENANT, "phone": PHONE,
            "role": "customer", "name": "Old Name", "email": "old@x.com", "isActive": True,
        })
        customer, created = otp.find_or_create_phone_customer(TENANT, PHONE_E164, "New Name")
        self.assertFalse(created)
        self.assertEqual(customer["_id"], existing_id)
        self.assertEqual(customer["name"], "Old Name")
        self.assertEqual(len(self.users.docs), 1)

    def test_same_phone_in_another_store_is_a_different_customer(self):
        self.users.docs.append({
            "_id": ObjectId(), "tenantId": "shop-b", "phone": PHONE_E164,
            "role": "customer", "isActive": True,
        })
        _customer, created = otp.find_or_create_phone_customer(TENANT, PHONE)
        self.assertTrue(created)

    def test_disabled_customer_refused(self):
        self.users.docs.append({
            "_id": ObjectId(), "tenantId": TENANT, "phone": PHONE_E164,
            "role": "customer", "isActive": False,
        })
        with self.assertRaises(HTTPException) as error:
            otp.find_or_create_phone_customer(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 403)

    def test_staff_phone_conflict_is_409(self):
        self.users.docs.append({
            "_id": ObjectId(), "tenantId": TENANT, "phone": PHONE_E164,
            "role": "store_manager", "isActive": True,
        })
        with self.assertRaises(HTTPException) as error:
            otp.find_or_create_phone_customer(TENANT, PHONE)
        self.assertEqual(error.exception.status_code, 409)


class VerifyRouteTests(_OtpTestCase):
    def setUp(self):
        super().setUp()
        self.rate_patch = patch.object(auth_routes.rate_limit, "hit")
        self.rate_hit = self.rate_patch.start()
        self.request = MagicMock()
        self.request.headers = {}
        self.request.client.host = "10.0.0.9"

    def tearDown(self):
        self.rate_patch.stop()
        super().tearDown()

    def _send(self):
        auth_routes.send_customer_otp(
            CustomerOtpSendRequest(tenantId=TENANT, phone=PHONE), self.request,
        )
        return self.sent_code()

    def _verify(self, code, name=None):
        return auth_routes.verify_customer_otp(
            CustomerOtpVerifyRequest(tenantId=TENANT, phone=PHONE, otp=code, name=name),
            self.request,
        )

    def test_send_applies_ip_and_phone_limits(self):
        self._send()
        scopes = [call.args[0] for call in self.rate_hit.call_args_list]
        self.assertIn("customer_otp_send_ip", scopes)
        self.assertIn("customer_otp_send_phone", scopes)

    def test_verify_creates_customer_and_returns_login_shape(self):
        response = self._verify(self._send(), name="Asha")
        self.assertTrue(response["success"])
        self.assertTrue(response["isNewCustomer"])
        self.assertEqual(response["token_type"], "Bearer")
        self.assertEqual(response["user"]["role"], "customer")
        self.assertEqual(response["user"]["tenantId"], TENANT)
        self.assertEqual(response["user"]["name"], "Asha")
        claims = jwt.decode(response["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
        self.assertEqual(claims["role"], "customer")
        self.assertEqual(claims["tenantId"], TENANT)
        self.assertEqual(claims["userId"], str(self.users.docs[0]["_id"]))
        self.assertEqual(len(self.users.docs), 1)

    def test_verify_reuses_existing_customer(self):
        self._verify(self._send())
        self.otps.docs[-1]["createdAt"] -= timedelta(minutes=1)
        second = self._verify(self._send())
        self.assertFalse(second["isNewCustomer"])
        self.assertEqual(len(self.users.docs), 1)
        self.assertEqual(second["user"]["userId"], str(self.users.docs[0]["_id"]))

    def test_wrong_code_does_not_create_customer(self):
        code = self._send()
        wrong = "000000" if code != "000000" else "111111"
        with self.assertRaises(HTTPException):
            self._verify(wrong)
        self.assertEqual(self.users.docs, [])

    def test_verify_refuses_inactive_store(self):
        code = self._send()
        self.tenants.docs[0]["isActive"] = False
        with self.assertRaises(HTTPException) as error:
            self._verify(code)
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(self.users.docs, [])


class TenantHeaderCheckTests(unittest.TestCase):
    CUSTOMER = {"userId": "u1", "tenantId": "shop-a", "role": "customer"}

    def test_matching_header_allowed(self):
        self.assertEqual(require_customer(dict(self.CUSTOMER), "Shop-A"), self.CUSTOMER)

    def test_missing_header_allowed(self):
        self.assertEqual(require_customer(dict(self.CUSTOMER), None), self.CUSTOMER)
        self.assertEqual(require_customer(dict(self.CUSTOMER), "  "), self.CUSTOMER)

    def test_mismatched_header_rejected_with_401(self):
        with self.assertRaises(HTTPException) as error:
            require_customer(dict(self.CUSTOMER), "shop-b")
        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.detail, "You're signed in to a different store.")

    def test_non_customer_still_forbidden(self):
        with self.assertRaises(HTTPException) as error:
            require_customer({"userId": "a", "tenantId": "shop-a", "role": "admin"}, "shop-a")
        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
