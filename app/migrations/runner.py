"""Migration discovery, bookkeeping and locking. Pure functions over a `db` handle."""

from __future__ import annotations

import importlib
import inspect
import os
import pkgutil
import re
import socket
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import ModuleType
from typing import Callable

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

MIGRATIONS_COLLECTION = "schema_migrations"
LOCK_COLLECTION = "schema_migrations_lock"
LOCK_ID = "migrations"
LOCK_TTL = timedelta(minutes=30)

_MODULE_PATTERN = re.compile(r"^(\d{4})_([a-z0-9_]+)$")
_PACKAGE = "app.migrations"


class MigrationError(RuntimeError):
    pass


class MigrationLockError(MigrationError):
    """Another runner holds the lock (or this runner lost it)."""


@dataclass(frozen=True)
class Migration:
    id: str  # "0001"
    name: str  # "backfill_order_numbers"
    module: ModuleType

    @property
    def full_name(self) -> str:
        return f"{self.id}_{self.name}"

    @property
    def description(self) -> str:
        doc = (self.module.__doc__ or "").strip()
        return doc.splitlines()[0] if doc else ""

    def accepts(self, parameter: str) -> bool:
        return parameter in inspect.signature(self.module.up).parameters


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def discover_migrations(package: str = _PACKAGE) -> list[Migration]:
    """All NNNN_name modules in the package, in id order. Ids must be unique."""
    pkg = importlib.import_module(package)
    found: dict[str, Migration] = {}
    for info in pkgutil.iter_modules(pkg.__path__):
        match = _MODULE_PATTERN.match(info.name)
        if not match:
            continue
        migration_id, name = match.groups()
        if migration_id in found:
            raise MigrationError(
                f"Duplicate migration id {migration_id}: "
                f"{found[migration_id].full_name} and {info.name}"
            )
        module = importlib.import_module(f"{package}.{info.name}")
        if not callable(getattr(module, "up", None)):
            raise MigrationError(f"Migration {info.name} has no up(db) function")
        if not (module.__doc__ or "").strip():
            raise MigrationError(f"Migration {info.name} has no docstring")
        found[migration_id] = Migration(migration_id, name, module)
    return [found[key] for key in sorted(found)]


def applied_migrations(db) -> dict[str, dict]:
    return {doc["_id"]: doc for doc in db[MIGRATIONS_COLLECTION].find({})}


def status(db, migrations: list[Migration]) -> list[dict]:
    """One row per known migration plus rows for recorded-but-unknown ids."""
    applied = applied_migrations(db)
    rows = []
    for migration in migrations:
        record = applied.get(migration.id)
        rows.append(
            {
                "id": migration.id,
                "name": migration.name,
                "description": migration.description,
                "applied": record is not None,
                "appliedAt": (record or {}).get("appliedAt"),
                "durationMs": (record or {}).get("durationMs"),
            }
        )
    known = {m.id for m in migrations}
    for migration_id, record in sorted(applied.items()):
        if migration_id not in known:
            rows.append(
                {
                    "id": migration_id,
                    "name": record.get("name", "?"),
                    "description": "recorded in the database but not found in code",
                    "applied": True,
                    "appliedAt": record.get("appliedAt"),
                    "durationMs": record.get("durationMs"),
                }
            )
    return rows


def pending_migrations(
    db, migrations: list[Migration], target: str | None = None
) -> list[Migration]:
    if target is not None and target not in {m.id for m in migrations}:
        raise MigrationError(f"Unknown migration id {target!r}")
    applied = applied_migrations(db)
    return [
        m
        for m in sorted(migrations, key=lambda m: m.id)
        if m.id not in applied and (target is None or m.id <= target)
    ]


# --- lock -------------------------------------------------------------------


def new_lock_owner() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def acquire_lock(db, owner: str, *, ttl: timedelta = LOCK_TTL, now: datetime | None = None) -> None:
    """Take the single runner lock, or take over one whose holder let it expire."""
    now = now or _utcnow()
    collection = db[LOCK_COLLECTION]
    fields = {"owner": owner, "acquiredAt": now, "expiresAt": now + ttl}
    try:
        collection.insert_one({"_id": LOCK_ID, **fields})
        return
    except DuplicateKeyError:
        pass
    taken = collection.find_one_and_update(
        {"_id": LOCK_ID, "expiresAt": {"$lt": now}},
        {"$set": fields},
        return_document=ReturnDocument.AFTER,
    )
    if taken and taken.get("owner") == owner:
        return
    held = collection.find_one({"_id": LOCK_ID}) or {}
    raise MigrationLockError(
        f"Another migration runner holds the lock (owner={held.get('owner')}, "
        f"acquiredAt={held.get('acquiredAt')}, expiresAt={held.get('expiresAt')}). "
        "Wait for it to finish; if it crashed, the lock expires by itself, or run "
        "`python -m app.migrations unlock`."
    )


def refresh_lock(db, owner: str, *, ttl: timedelta = LOCK_TTL) -> None:
    result = db[LOCK_COLLECTION].update_one(
        {"_id": LOCK_ID, "owner": owner},
        {"$set": {"expiresAt": _utcnow() + ttl}},
    )
    if result.matched_count == 0:
        raise MigrationLockError(
            "Lost the migration lock (it expired and another runner took it). Stopping."
        )


def release_lock(db, owner: str) -> None:
    db[LOCK_COLLECTION].delete_one({"_id": LOCK_ID, "owner": owner})


def force_unlock(db) -> dict | None:
    collection = db[LOCK_COLLECTION]
    held = collection.find_one({"_id": LOCK_ID})
    collection.delete_one({"_id": LOCK_ID})
    return held


# --- running ------------------------------------------------------------------


def _call_up(migration: Migration, db, *, dry_run: bool, log, heartbeat):
    kwargs = {}
    if migration.accepts("dry_run"):
        kwargs["dry_run"] = dry_run
    if migration.accepts("log"):
        kwargs["log"] = log
    if migration.accepts("heartbeat"):
        kwargs["heartbeat"] = heartbeat
    return migration.module.up(db, **kwargs)


def _record(db, migration: Migration, duration_ms: int, summary, now: datetime) -> None:
    db[MIGRATIONS_COLLECTION].update_one(
        {"_id": migration.id},
        {
            "$set": {
                "name": migration.name,
                "lastRunAt": now,
                "durationMs": duration_ms,
                "summary": summary if isinstance(summary, dict) else None,
            },
            "$setOnInsert": {"appliedAt": now},
            "$inc": {"runCount": 1},
        },
        upsert=True,
    )


def run(
    db,
    migrations: list[Migration],
    *,
    dry_run: bool = False,
    log: Callable[[str], None] = print,
    owner: str | None = None,
    rerun: bool = False,
) -> list[str]:
    """Apply `migrations` in order (already filtered to what should run).

    dry_run takes no lock and writes nothing: each migration that supports it
    reports what it would do; others are only listed. Note that in a dry run a
    later migration sees the data as it is now, before earlier ones ran.

    A real run holds the lock for its whole duration, refreshes it between
    (and, via `heartbeat`, during) migrations, records each migration only
    after it finished successfully, and stops at the first failure.
    Returns the ids that ran.
    """
    ordered = sorted(migrations, key=lambda m: m.id)
    if not ordered:
        log("Nothing to do: no pending migrations.")
        return []

    if dry_run:
        for migration in ordered:
            log(f"== {migration.full_name} (dry run): {migration.description}")
            if migration.accepts("dry_run"):
                _call_up(migration, db, dry_run=True, log=log, heartbeat=lambda: None)
            else:
                log("   (no dry-run support; would run)")
        return [m.id for m in ordered]

    owner = owner or new_lock_owner()
    acquire_lock(db, owner)
    ran: list[str] = []
    try:
        applied = applied_migrations(db)
        for migration in ordered:
            refresh_lock(db, owner)
            if migration.id in applied and not rerun:
                # Another runner applied it between our status read and the lock.
                log(f"== {migration.full_name}: already applied, skipping")
                continue
            log(f"== {migration.full_name}: {migration.description}")
            started = time.monotonic()
            summary = _call_up(
                migration,
                db,
                dry_run=False,
                log=log,
                heartbeat=lambda: refresh_lock(db, owner),
            )
            duration_ms = int((time.monotonic() - started) * 1000)
            refresh_lock(db, owner)
            _record(db, migration, duration_ms, summary, _utcnow())
            log(f"   done in {duration_ms} ms")
            ran.append(migration.id)
    finally:
        release_lock(db, owner)
    return ran
