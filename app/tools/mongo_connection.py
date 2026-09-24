"""MongoDB connection helper for operator CLIs (migrations, store export/import).

Deliberately does NOT import app.database.mongo: that module connects to the
configured (production) database as an import side effect. The CLIs here only
connect when they are actually run, and they accept --mongo-uri / --db
overrides so they can be pointed at a staging copy or a restored snapshot.
"""

from __future__ import annotations

import os
import re
import sys


def _env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    return value.strip().strip('"').strip("'") or None


def redact_uri(uri: str | None) -> str:
    """mongodb+srv://user:secret@host/... -> mongodb+srv://***@host/..."""
    if not uri:
        return "<unset>"
    redacted = re.sub(r"(//)[^@/]*@", r"\1***@", uri)
    return redacted.split("?", 1)[0]


def resolve_settings(uri: str | None = None, db_name: str | None = None) -> tuple[str, str]:
    """Explicit arguments win; otherwise MONGO_URI / DATABASE_NAME from env/.env."""
    if not uri or not db_name:
        try:
            from dotenv import load_dotenv

            load_dotenv()
        except ImportError:  # pragma: no cover - python-dotenv is a dependency
            pass
    uri = uri or _env("MONGO_URI")
    db_name = db_name or _env("DATABASE_NAME")
    if not uri or not db_name:
        raise SystemExit(
            "MongoDB settings missing: pass --mongo-uri/--db or set MONGO_URI and "
            "DATABASE_NAME."
        )
    return uri, db_name


def is_env_target(uri: str | None, db_name: str | None) -> bool:
    """True if (uri, db_name) resolve to the database configured in env/.env."""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    env_uri, env_db = _env("MONGO_URI"), _env("DATABASE_NAME")
    return (uri or env_uri) == env_uri and (db_name or env_db) == env_db


def client_kwargs(uri: str) -> dict:
    """Same connection options as app/database/mongo.py (tz-aware, certifi CA)."""
    options: dict = {
        "serverSelectionTimeoutMS": 15000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 120000,
        "retryWrites": True,
        "tz_aware": True,
    }
    if uri.startswith("mongodb+srv://") or "tls=true" in uri.lower():
        import certifi
        from pymongo.server_api import ServerApi

        options["tlsCAFile"] = certifi.where()
        options["server_api"] = ServerApi("1")
        if (_env("MONGO_TLS_INSECURE") or "").lower() in {"1", "true", "yes", "on"}:
            options["tlsAllowInvalidCertificates"] = True
    return options


def connect(uri: str | None = None, db_name: str | None = None):
    """Return (client, db) for the resolved settings."""
    from pymongo import MongoClient

    uri, db_name = resolve_settings(uri, db_name)
    client = MongoClient(uri, **client_kwargs(uri))
    return client, client[db_name]


def describe_target(uri: str | None, db_name: str | None) -> str:
    uri, db_name = resolve_settings(uri, db_name)
    return f"{redact_uri(uri)}  database={db_name}"


def confirm(prompt_value: str, *, assume_yes: bool, what: str) -> None:
    """Require --yes, or the operator typing `prompt_value` on an interactive terminal."""
    if assume_yes:
        return
    if not sys.stdin or not sys.stdin.isatty():
        raise SystemExit(f"Refusing to {what} without --yes (no interactive terminal).")
    try:
        answer = input(f"Type the database name '{prompt_value}' to {what}: ").strip()
    except EOFError:
        raise SystemExit(f"Refusing to {what}: no confirmation given (use --yes).") from None
    if answer != prompt_value:
        raise SystemExit("Aborted: confirmation did not match.")
