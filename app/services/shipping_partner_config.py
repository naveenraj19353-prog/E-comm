"""Load delivery partners and API lists from config/shipping_partners.json."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}")
_PLACEHOLDER_PATTERN = re.compile(r"\{([a-zA-Z0-9_]+)\}")
_DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "shipping_partners.json"
)


class ShippingConfigError(Exception):
    pass


def _env_value(name: str, default: str | None = None) -> str:
    value = os.getenv(name)
    if value is None or not str(value).strip():
        return default or ""
    return str(value).strip().strip('"').strip("'")


def interpolate_env(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: interpolate_env(item) for key, item in value.items()}
    if isinstance(value, list):
        return [interpolate_env(item) for item in value]
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        return _env_value(match.group(1), match.group(2))

    return _ENV_PATTERN.sub(replace, value)


def interpolate_vars(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: interpolate_vars(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [interpolate_vars(item, variables) for item in value]
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables or variables[key] is None:
            return match.group(0)
        return str(variables[key])

    return _PLACEHOLDER_PATTERN.sub(replace, value)


def _config_path() -> Path:
    override = os.getenv("SHIPPING_PARTNERS_FILE")
    if override and override.strip():
        return Path(override.strip())
    return _DEFAULT_CONFIG_PATH


@lru_cache(maxsize=1)
def load_shipping_partners() -> dict:
    path = _config_path()
    if not path.exists():
        raise ShippingConfigError(f"Missing shipping config: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return interpolate_env(raw)


def reload_shipping_partners() -> dict:
    load_shipping_partners.cache_clear()
    return load_shipping_partners()


def default_provider_id() -> str:
    catalog = load_shipping_partners()
    return str(catalog.get("defaultProvider") or "delhivery").strip().lower()


def list_partner_ids(*, enabled_only: bool = True) -> list[str]:
    partners = load_shipping_partners().get("partners") or {}
    ids = []
    for key, spec in partners.items():
        if key.startswith("_"):
            continue
        if not isinstance(spec, dict):
            continue
        if enabled_only and spec.get("enabled") is False:
            continue
        ids.append(str(key).strip().lower())
    return ids


def partner_display_name(provider: str) -> str:
    key = str(provider or "").strip().lower()
    try:
        spec = get_partner_spec(key)
    except ShippingConfigError:
        return key or "delivery partner"
    return str(spec.get("displayName") or key or "delivery partner")


def get_partner_spec(provider: str) -> dict:
    key = str(provider or "").strip().lower()
    partners = load_shipping_partners().get("partners") or {}
    spec = partners.get(key)
    if not isinstance(spec, dict):
        raise ShippingConfigError(
            f"Delivery partner '{key}' is not defined in shipping_partners.json."
        )
    if spec.get("enabled") is False:
        raise ShippingConfigError(
            f"Delivery partner '{key}' is disabled in shipping_partners.json."
        )
    return spec


def partner_base_url(provider: str) -> str:
    spec = get_partner_spec(provider)
    explicit = str(spec.get("baseUrl") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    env_name = str(spec.get("env") or "live").strip().lower()
    hosts = spec.get("hosts") if isinstance(spec.get("hosts"), dict) else {}
    host = (
        hosts.get(env_name)
        or hosts.get("live")
        or hosts.get("production")
        or hosts.get("staging")
        or ""
    )
    return str(host).rstrip("/")


def get_operation(provider: str, name: str) -> dict:
    spec = get_partner_spec(provider)
    operations = spec.get("operations") if isinstance(spec.get("operations"), dict) else {}
    operation = operations.get(name)
    if not isinstance(operation, dict) or not operation.get("path"):
        raise ShippingConfigError(
            f"Partner '{provider}' has no '{name}' API in shipping_partners.json."
        )
    return operation


def extract_path(payload: Any, path: str) -> Any:
    current = payload
    for part in str(path or "").split("."):
        if part == "":
            continue
        if isinstance(current, list) and part.isdigit():
            index = int(part)
            if index >= len(current):
                return None
            current = current[index]
            continue
        if isinstance(current, dict):
            current = current.get(part)
            continue
        return None
    return current


def _parse_days(value: Any) -> int | None:
    if value is None or value is False:
        return None
    if isinstance(value, (int, float)) and value > 0:
        return max(1, min(int(value), 30))
    text = str(value).strip()
    digits: list[int] = []
    current = ""
    for character in text:
        if character.isdigit():
            current += character
        elif current:
            digits.append(int(current))
            current = ""
    if current:
        digits.append(int(current))
    if not digits:
        return None
    return max(1, min(max(digits), 30))


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ok"}


def map_response(payload: Any, mapping: dict | None) -> dict[str, Any]:
    mapped: dict[str, Any] = {}
    if not isinstance(mapping, dict):
        return mapped
    for key, rule in mapping.items():
        if isinstance(rule, str):
            rule = {"path": rule}
        if not isinstance(rule, dict):
            continue
        value = extract_path(payload, str(rule.get("path") or ""))
        if rule.get("nonempty"):
            mapped[key] = bool(value)
            continue
        if rule.get("truthy"):
            mapped[key] = _truthy(value)
            continue
        if rule.get("number"):
            try:
                mapped[key] = round(float(value), 2) if value is not None else None
            except (TypeError, ValueError):
                mapped[key] = None
            continue
        if rule.get("days"):
            mapped[key] = _parse_days(value)
            continue
        mapped[key] = value
    return mapped
