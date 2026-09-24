"""WhatsApp one-time codes for storefront customers (phone login + guest checkout).

Same approach as `store_signup_otp_service`: codes are HMAC-hashed with the
app secret, expire after 10 minutes, allow 5 wrong guesses, and a new code
can't be requested for 45 seconds. Outside production a failed WhatsApp send
logs the code instead, so local development works without Periskope.

Codes are scoped to (tenantId, phone): a code sent for one store can't be
used to sign in to another.
"""

from __future__ import annotations

import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.config import IS_PRODUCTION, SECRET_KEY
from app.database.mongo import customer_otps, tenants, users
from app.routes.detail_messages import TENANT_NOT_FOUND_OR_INACTIVE
from app.services.billing_service import STORE_UNAVAILABLE_MESSAGE, is_store_operational
from app.services.periskope_service import PeriskopeError, PeriskopeService
from app.utils.hash import hash_password
from app.utils.phone_normalization import PhoneNormalizationError, mask_phone, normalize_phone

logger = logging.getLogger(__name__)

OTP_MINUTES = 10
RESEND_SECONDS = 45
MAX_SENDS_PER_HOUR = 5
MAX_ATTEMPTS = 5
OTP_LENGTH = 6
PHONE_COUNTRY = "India"


def normalize_tenant(tenant_id: str) -> str:
    return str(tenant_id or "").strip().lower()


def _normalize_code(code: str) -> str:
    return "".join(ch for ch in str(code or "") if ch.isdigit())


def normalize_customer_phone(phone: str) -> str:
    """Digits with country code, e.g. 919876543210 (India assumed for 10 digits)."""
    try:
        return normalize_phone(phone, country=PHONE_COUNTRY)
    except PhoneNormalizationError as error:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid WhatsApp number, for example 98XXXXXXXX.",
        ) from error


def phone_lookup_candidates(phone: str) -> list[str]:
    """Forms the same number may already be stored in on older customer records.

    Registration stored whatever the shopper typed and menu guests store bare
    digits, so a returning customer may be saved as 9876543210, 919876543210
    or +919876543210.
    """
    candidates = [phone, f"+{phone}"]
    if phone.startswith("91") and len(phone) == 12:
        candidates.append(phone[2:])
    return candidates


def hash_customer_otp(tenant_id: str, phone: str, code: str) -> str:
    payload = f"customer:{normalize_tenant(tenant_id)}:{_normalize_code(phone)}:{_normalize_code(code)}"
    return hmac.new(
        (SECRET_KEY or "dev-secret").encode("utf-8"),
        payload.encode("utf-8"),
        sha256,
    ).hexdigest()


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def require_otp_tenant(tenant_id: str) -> dict:
    """The store must be live: active, not deleted, and not suspended for billing."""
    tenant = tenants.find_one(
        {
            "tenantId": normalize_tenant(tenant_id),
            "isActive": True,
            "deletedAt": {"$exists": False},
        }
    )
    if not tenant:
        raise HTTPException(status_code=404, detail=TENANT_NOT_FOUND_OR_INACTIVE)
    if not is_store_operational(tenant):
        raise HTTPException(status_code=402, detail=STORE_UNAVAILABLE_MESSAGE)
    return tenant


def send_customer_otp_whatsapp(phone: str, code: str, store_name: str) -> None:
    service = PeriskopeService()
    if not service.configured:
        raise PeriskopeError(
            "WhatsApp is not configured. Set PERISKOPE_API_KEY and PERISKOPE_PHONE.",
            code="NOT_CONFIGURED",
        )
    store = (store_name or "").strip() or "the store"
    message = (
        f"Your sign-in code for {store} is {code}. "
        f"It expires in {OTP_MINUTES} minutes. Do not share this code."
    )
    service.send_text_message(f"{phone}@c.us", message)


def send_customer_otp(tenant_id: str, phone: str) -> dict:
    tenant_id = normalize_tenant(tenant_id)
    phone = normalize_customer_phone(phone)
    tenant = require_otp_tenant(tenant_id)

    now = datetime.now(timezone.utc)
    scope = {"tenantId": tenant_id, "phone": phone}
    recent_count = customer_otps.count_documents(
        {**scope, "createdAt": {"$gte": now - timedelta(hours=1)}},
    )
    if recent_count >= MAX_SENDS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="Too many code requests. Try again later.",
        )

    last = customer_otps.find_one(scope, sort=[("createdAt", -1)])
    created = _aware((last or {}).get("createdAt"))
    if created:
        elapsed = (now - created).total_seconds()
        if elapsed < RESEND_SECONDS:
            wait = max(1, int(RESEND_SECONDS - elapsed))
            raise HTTPException(
                status_code=429,
                detail=f"Wait {wait} seconds before requesting another code.",
                headers={"Retry-After": str(wait)},
            )

    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    inserted = customer_otps.insert_one(
        {
            **scope,
            "codeHash": hash_customer_otp(tenant_id, phone, code),
            "attempts": 0,
            "consumedAt": None,
            "expiresAt": now + timedelta(minutes=OTP_MINUTES),
            "createdAt": now,
        }
    )
    response = {
        "success": True,
        "message": f"We sent a 6-digit code to WhatsApp {mask_phone(phone)}.",
        "expiresInSeconds": OTP_MINUTES * 60,
        "resendInSeconds": RESEND_SECONDS,
        "phone": phone,
    }
    try:
        send_customer_otp_whatsapp(phone, code, tenant.get("name") or "")
    except PeriskopeError as error:
        if IS_PRODUCTION:
            customer_otps.delete_one({"_id": inserted.inserted_id})
            raise HTTPException(
                status_code=502,
                detail="Could not send the WhatsApp code. Try again.",
            ) from error
        logger.warning(
            "Customer WhatsApp OTP not sent (%s). Code for %s at %s: %s",
            error.code,
            mask_phone(phone),
            tenant_id,
            code,
        )
        response["message"] = (
            "WhatsApp could not be sent. Check the API terminal for your code."
        )
    except Exception as error:
        customer_otps.delete_one({"_id": inserted.inserted_id})
        logger.exception("Failed to send customer OTP to %s", mask_phone(phone))
        raise HTTPException(
            status_code=500,
            detail="Could not send the WhatsApp code. Try again.",
        ) from error
    return response


def consume_customer_otp(tenant_id: str, phone: str, code: str) -> None:
    tenant_id = normalize_tenant(tenant_id)
    phone = normalize_customer_phone(phone)
    code = _normalize_code(code)
    if len(code) != OTP_LENGTH:
        raise HTTPException(status_code=400, detail="Enter the 6-digit code from WhatsApp.")

    now = datetime.now(timezone.utc)
    record = customer_otps.find_one(
        {"tenantId": tenant_id, "phone": phone, "consumedAt": None},
        sort=[("createdAt", -1)],
    )
    if not record:
        raise HTTPException(status_code=400, detail="Request a code first.")

    expires = _aware(record.get("expiresAt"))
    if not expires or expires < now:
        raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")

    if int(record.get("attempts") or 0) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Request a new code.",
        )

    expected = str(record.get("codeHash") or "")
    if not hmac.compare_digest(expected, hash_customer_otp(tenant_id, phone, code)):
        customer_otps.update_one({"_id": record["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid code.")

    # Only one caller can consume a given code, even if two verify at once.
    result = customer_otps.update_one(
        {"_id": record["_id"], "consumedAt": None},
        {"$set": {"consumedAt": now}},
    )
    if getattr(result, "matched_count", 1) == 0:
        raise HTTPException(status_code=400, detail="That code was already used. Request a new one.")


def _find_customer(tenant_id: str, phone: str) -> dict | None:
    return users.find_one(
        {
            "tenantId": tenant_id,
            "role": "customer",
            "phone": {"$in": phone_lookup_candidates(phone)},
        }
    )


def _clean_name(name: str | None) -> str:
    value = " ".join(str(name or "").split())
    return value[:100]


def find_or_create_phone_customer(
    tenant_id: str,
    phone: str,
    name: str | None = None,
) -> tuple[dict, bool]:
    """Return (customer, created). Call only after the phone was verified."""
    tenant_id = normalize_tenant(tenant_id)
    phone = normalize_customer_phone(phone)
    now = datetime.now(timezone.utc)

    existing = _find_customer(tenant_id, phone)
    if existing:
        if not existing.get("isActive", False):
            raise HTTPException(
                status_code=403,
                detail="This account has been disabled. Contact the store.",
            )
        updates: dict = {"phoneVerifiedAt": now, "updatedAt": now}
        clean = _clean_name(name)
        if clean and len(clean) >= 2 and not str(existing.get("name") or "").strip():
            updates["name"] = clean
        users.update_one({"_id": existing["_id"]}, {"$set": updates})
        existing.update(updates)
        return existing, False

    clean = _clean_name(name)
    payload = {
        "tenantId": tenant_id,
        "name": clean if len(clean) >= 2 else f"Customer {phone[-4:]}",
        "phone": phone,
        # No password sign-in until the customer sets one (via reset flow once
        # they add an email). A random hash nobody knows keeps the field shape.
        "password": hash_password(secrets.token_urlsafe(32)),
        "passwordSet": False,
        "role": "customer",
        "authChannel": "phone",
        "phoneVerifiedAt": now,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        result = users.insert_one(payload)
    except DuplicateKeyError as error:
        # Either a concurrent verify created the customer first, or the number
        # belongs to a staff account of this store.
        existing = _find_customer(tenant_id, phone)
        if existing and existing.get("isActive", False):
            return existing, False
        raise HTTPException(
            status_code=409,
            detail="This number can't be used to sign in to this store.",
        ) from error
    payload["_id"] = result.inserted_id
    return payload, True
