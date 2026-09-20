"""Phone normalization for provider API calls without changing stored customer data."""

from __future__ import annotations

import re


class PhoneNormalizationError(ValueError):
    pass


_COUNTRY_CODES = {
    "in": "91",
    "india": "91",
}


def normalize_phone(value: str | None, *, country: str | None = None) -> str:
    raw = (value or "").strip()
    if not raw:
        raise PhoneNormalizationError("Customer phone number is missing.")

    digits = re.sub(r"\D", "", raw)
    country_code = _COUNTRY_CODES.get((country or "").strip().lower())

    if not raw.startswith("+") and digits.startswith("0") and country_code:
        national = digits.lstrip("0")
        if len(national) == 10:
            return f"{country_code}{national}"

    if raw.startswith("+"):
        if 8 <= len(digits) <= 15:
            return digits
        raise PhoneNormalizationError("Phone number is not valid E.164.")

    if 11 <= len(digits) <= 15:
        return digits

    if len(digits) == 10:
        if country_code:
            return f"{country_code}{digits}"
        raise PhoneNormalizationError(
            "A country is required for a phone number without a country code."
        )

    raise PhoneNormalizationError("Phone number must include a valid country code.")


def mask_phone(value: str | None, visible: int = 4) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return ""
    if len(digits) <= visible:
        return "*" * len(digits)
    return f"{'*' * (len(digits) - visible)}{digits[-visible:]}"
