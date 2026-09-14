"""Encrypt secrets at rest (e.g. tenant Delhivery API tokens)."""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import SECRET_KEY, TOKEN_ENCRYPTION_KEY

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    raw = (TOKEN_ENCRYPTION_KEY or SECRET_KEY or "").strip()
    if not raw:
        raise RuntimeError("SECRET_KEY or TOKEN_ENCRYPTION_KEY is required for encryption.")
    # Fernet key = url-safe base64 of 32 bytes
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    text = (plaintext or "").strip()
    if not text:
        raise ValueError("Cannot encrypt empty secret.")
    return _fernet().encrypt(text.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    blob = (ciphertext or "").strip()
    if not blob:
        raise ValueError("Cannot decrypt empty ciphertext.")
    try:
        return _fernet().decrypt(blob.encode("utf-8")).decode("utf-8")
    except InvalidToken as error:
        logger.error("Failed to decrypt secret (invalid key or corrupt ciphertext).")
        raise ValueError("Unable to decrypt stored secret.") from error


def mask_secret(plaintext: str | None, visible: int = 4) -> str:
    text = (plaintext or "").strip()
    if not text:
        return ""
    if len(text) <= visible:
        return "•" * len(text)
    return f"{'•' * max(len(text) - visible, 8)}{text[-visible:]}"
