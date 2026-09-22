from __future__ import annotations

import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import HTTPException

from app.config import IS_PRODUCTION, SECRET_KEY
from app.database.mongo import store_signup_otps, tenants
from app.services.periskope_service import PeriskopeError, PeriskopeService
from app.utils.phone_normalization import PhoneNormalizationError, mask_phone, normalize_phone

logger = logging.getLogger(__name__)

OTP_MINUTES = 10
RESEND_SECONDS = 45
MAX_SENDS_PER_HOUR = 5
MAX_ATTEMPTS = 5
OTP_LENGTH = 6


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _normalize_code(code: str) -> str:
    return "".join(ch for ch in str(code or "") if ch.isdigit())


def _normalize_signup_phone(phone: str) -> str:
    try:
        return normalize_phone(phone, country="India")
    except PhoneNormalizationError as error:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid WhatsApp number with country code, for example 9198XXXXXXXX.",
        ) from error


def hash_store_otp(email: str, code: str, phone: str = "") -> str:
    payload = (
        f"{_normalize_email(email)}:{_normalize_code(phone)}:{_normalize_code(code)}"
    )
    return hmac.new(
        (SECRET_KEY or "dev-secret").encode("utf-8"),
        payload.encode("utf-8"),
        sha256,
    ).hexdigest()


def send_store_otp_whatsapp(phone: str, code: str) -> None:
    service = PeriskopeService()
    if not service.configured:
        raise PeriskopeError(
            "WhatsApp is not configured. Set PERISKOPE_API_KEY and PERISKOPE_PHONE.",
            code="NOT_CONFIGURED",
        )
    message = (
        f"Your Retail Cosmos store verification code is {code}. "
        f"It expires in {OTP_MINUTES} minutes. Do not share this code."
    )
    service.send_text_message(f"{phone}@c.us", message)


def send_store_signup_otp(email: str, phone: str) -> dict:
    email = _normalize_email(email)
    phone = _normalize_signup_phone(phone)
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    if tenants.find_one({"email": email}):
        raise HTTPException(
            status_code=400,
            detail="That email is already used by another store. Sign in instead.",
        )

    now = datetime.now(timezone.utc)
    hour_ago = now - timedelta(hours=1)
    recent_count = store_signup_otps.count_documents(
        {"phone": phone, "createdAt": {"$gte": hour_ago}},
    )
    if recent_count >= MAX_SENDS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Try again later.",
        )

    last = store_signup_otps.find_one({"phone": phone}, sort=[("createdAt", -1)])
    if last and last.get("createdAt"):
        created = last["createdAt"]
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        elapsed = (now - created).total_seconds()
        if elapsed < RESEND_SECONDS:
            wait = int(RESEND_SECONDS - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Wait {wait} seconds before requesting another code.",
            )

    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    inserted = store_signup_otps.insert_one(
        {
            "email": email,
            "phone": phone,
            "codeHash": hash_store_otp(email, code, phone),
            "attempts": 0,
            "consumedAt": None,
            "expiresAt": now + timedelta(minutes=OTP_MINUTES),
            "createdAt": now,
        }
    )
    try:
        send_store_otp_whatsapp(phone, code)
    except PeriskopeError as error:
        if IS_PRODUCTION:
            store_signup_otps.delete_one({"_id": inserted.inserted_id})
            raise HTTPException(
                status_code=502,
                detail="Could not send the WhatsApp verification code. Try again.",
            ) from error
        logger.warning(
            "WhatsApp OTP not sent (%s). Code for %s: %s",
            error.code,
            mask_phone(phone),
            code,
        )
        return {
            "success": True,
            "message": (
                "WhatsApp could not be sent. Check the API terminal for your "
                "verification code."
            ),
            "expiresInSeconds": OTP_MINUTES * 60,
        }
    except Exception:
        store_signup_otps.delete_one({"_id": inserted.inserted_id})
        logger.exception("Failed to send store signup OTP to %s", mask_phone(phone))
        raise HTTPException(
            status_code=500,
            detail="Could not send the WhatsApp verification code. Try again.",
        )
    return {
        "success": True,
        "message": f"We sent a verification code to WhatsApp {mask_phone(phone)}.",
        "expiresInSeconds": OTP_MINUTES * 60,
    }


def consume_store_signup_otp(email: str, code: str, phone: str) -> None:
    email = _normalize_email(email)
    phone = _normalize_signup_phone(phone)
    code = _normalize_code(code)
    if len(code) != OTP_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="Enter the 6-digit code from WhatsApp.",
        )

    now = datetime.now(timezone.utc)
    record = store_signup_otps.find_one(
        {"email": email, "phone": phone, "consumedAt": None},
        sort=[("createdAt", -1)],
    )
    if not record:
        raise HTTPException(
            status_code=400,
            detail="Request a verification code first.",
        )

    expires = record.get("expiresAt")
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < now:
        raise HTTPException(
            status_code=400,
            detail="That code has expired. Request a new one.",
        )

    attempts = int(record.get("attempts") or 0)
    if attempts >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Request a new code.",
        )

    expected = str(record.get("codeHash") or "")
    actual = hash_store_otp(email, code, phone)
    if not hmac.compare_digest(expected, actual):
        store_signup_otps.update_one(
            {"_id": record["_id"]},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    store_signup_otps.update_one(
        {"_id": record["_id"]},
        {"$set": {"consumedAt": now}},
    )
