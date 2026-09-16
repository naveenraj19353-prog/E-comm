"""Server-only client for the documented Periskope WhatsApp API."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

import requests

from app.config import (
    PERISKOPE_API_KEY,
    PERISKOPE_BASE_URL,
    PERISKOPE_PHONE,
    PERISKOPE_TIMEOUT_SECONDS,
    PERISKOPE_VERIFY_SSL,
)

logger = logging.getLogger(__name__)
PROVIDER = "periskope"


class PeriskopeError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "PERISKOPE_ERROR",
        status_code: int | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class PeriskopeService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        phone: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
    ):
        self.api_key = (
            PERISKOPE_API_KEY if api_key is None else api_key
        ) or ""
        self.api_key = self.api_key.strip()
        self.phone = (
            PERISKOPE_PHONE if phone is None else phone
        ) or ""
        self.phone = self.phone.strip()
        self.base_url = (base_url or PERISKOPE_BASE_URL).rstrip("/")
        self.timeout = timeout or PERISKOPE_TIMEOUT_SECONDS

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.phone)

    def _sender_phone(self) -> str:
        if self.phone.startswith("phone-"):
            return self.phone
        digits = re.sub(r"\D", "", self.phone)
        if len(digits) == 10:
            digits = f"91{digits}"
        if not 8 <= len(digits) <= 15:
            raise PeriskopeError(
                "Periskope sender phone is invalid.",
                code="INVALID_SENDER_PHONE",
            )
        return digits

    def _headers(self) -> dict[str, str]:
        if not self.configured:
            raise PeriskopeError(
                "Periskope credentials are not configured.",
                code="NOT_CONFIGURED",
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "x-phone": self._sender_phone(),
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            response = requests.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(),
                json=payload,
                timeout=self.timeout,
                verify=PERISKOPE_VERIFY_SSL,
            )
        except requests.RequestException as error:
            logger.warning(
                "[PERISKOPE] operation=%s status=network_error error=%s",
                path,
                type(error).__name__,
            )
            raise PeriskopeError(
                "Unable to connect to Periskope.",
                code="NETWORK_ERROR",
            ) from error

        if not response.ok:
            logger.warning(
                "[PERISKOPE] operation=%s status=provider_error http_status=%s",
                path,
                response.status_code,
            )
            raise PeriskopeError(
                "Periskope rejected the request.",
                code="PROVIDER_ERROR",
                status_code=response.status_code,
            )

        if not response.content:
            return {}
        try:
            data = response.json()
        except ValueError as error:
            raise PeriskopeError(
                "Periskope returned an invalid response.",
                code="INVALID_RESPONSE",
                status_code=response.status_code,
            ) from error
        return data if isinstance(data, dict) else {"data": data}

    def send_text_message(self, chat_id: str, message: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/message/send",
            payload={"chat_id": chat_id, "message": message},
        )

    def send_media_message(
        self,
        chat_id: str,
        message: str,
        *,
        media_url: str,
        filename: str,
        mimetype: str,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/message/send",
            payload={
                "chat_id": chat_id,
                "message": message,
                "media": {
                    "type": "image",
                    "url": media_url,
                    "filename": filename,
                    "mimetype": mimetype,
                },
            },
        )

    def get_chat(self, chat_id: str) -> dict[str, Any]:
        return self._request("GET", f"/chats/{quote(chat_id, safe='')}")

    def health_check(self) -> dict[str, Any]:
        return self._request("GET", "/phones")
