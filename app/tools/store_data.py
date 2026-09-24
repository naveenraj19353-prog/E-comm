"""Per-store export / import core (the CLIs are store_export.py / store_import.py).

An export directory holds one MongoDB Extended JSON Lines file per collection
(``<collection>.jsonl``, one document per line) plus ``manifest.json``, which is
written last: a directory without a manifest is an incomplete export.

Two modes:

* ``full`` (default): canonical Extended JSON (``relaxed=False``) so every BSON
  type round-trips exactly (ObjectId, Date, int vs double, Decimal128...).
  Contains secrets (see SENSITIVE_FIELDS). This is what store_import restores.
* ``handover``: for a store owner who is leaving. Only the collections in
  HANDOVER_COLLECTIONS, with SENSITIVE_FIELDS stripped, in relaxed Extended
  JSON (easier to read). Cannot be imported.

Which documents belong to a store: every document whose ``tenantId`` matches
the store's tenantId (case-insensitive exact match, like
checkout_service.tenant_id_query) in every collection of the database except
EXCLUDED_COLLECTIONS, plus the store's ``counters`` documents
(``_id`` = ``<name>:<tenantId>``, e.g. ``orders:demo-store``). That covers the
tenant document itself (``tenants.tenantId``) and the store's users
(customers and store managers; super admins have ``tenantId: null``).
Files in S3 (``tenants/<tenantId>/...``) are not in MongoDB and are not
exported; see docs/data-operations.md.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator

from bson import json_util
from bson.json_util import JSONMode, JSONOptions
from pymongo.errors import PyMongoError

FORMAT = "retail-cosmos-store-export"
FORMAT_VERSION = 1
MANIFEST = "manifest.json"
MODE_FULL = "full"
MODE_HANDOVER = "handover"

COUNTERS = "counters"
TENANTS = "tenants"

# Never exported/imported: runner bookkeeping, short-lived OTP/rate-limit docs.
EXCLUDED_COLLECTIONS = frozenset(
    {
        "schema_migrations",
        "schema_migrations_lock",
        "rate_limits",
        "store_signup_otps",
        "customer_otps",
    }
)

# collection -> {dotted field: why it is sensitive}. Stripped in handover mode.
SENSITIVE_FIELDS: dict[str, dict[str, str]] = {
    "tenants": {
        "password": "bcrypt hash of the store-owner login password",
        "resetToken": "live password-reset token for the store owner",
        "resetTokenExpiry": "expiry of the password-reset token",
        "billing.razorpaySubscriptionId": "platform Razorpay subscription id",
    },
    "users": {
        "password": "bcrypt hash of customer / store-manager passwords",
        "resetToken": "live password-reset token",
        "resetTokenExpiry": "expiry of the password-reset token",
    },
    "shipping_integrations": {
        "apiTokenEncrypted": (
            "store's Delhivery API token, Fernet-encrypted with the platform "
            "TOKEN_ENCRYPTION_KEY (or SECRET_KEY); decryptable by anyone holding that key"
        ),
    },
}

# Collections holding customer personal data (names, phones, emails, addresses).
PERSONAL_DATA_COLLECTIONS = {
    "users": "customer and staff names, emails, phones",
    "addresses": "customer postal addresses and phones",
    "orders": "customer name/phone/address snapshot per order",
    "payment_intents": "checkout snapshot incl. delivery address",
    "contact_messages": "name, email, phone, message text",
    "reviews": "reviewer display name",
    "notification_logs": "masked phone numbers",
    "shipments": "courier references for customer deliveries",
}

# What a leaving store owner receives (allowlist, so new collections are not
# handed over by accident). Everything else is platform-internal.
HANDOVER_COLLECTIONS = frozenset(
    {
        "tenants",
        "users",
        "products",
        "categories",
        "orders",
        "addresses",
        "coupons",
        "banners",
        "reviews",
        "contact_messages",
        "wishlists",
        "shipments",
        "shipping_locations",
        "ledger_entries",
        "payouts",
    }
)

_CANONICAL = JSONOptions(
    json_mode=JSONMode.CANONICAL, tz_aware=True, tzinfo=timezone.utc
)
_RELAXED = JSONOptions(json_mode=JSONMode.RELAXED, tz_aware=True, tzinfo=timezone.utc)
_CHUNK = 500
_SAFE_COLLECTION = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]*$")


class ExportError(RuntimeError):
    pass


class ImportRefused(RuntimeError):
    """Validation or safety check failed; nothing was written."""


# --- matching ---------------------------------------------------------------


def normalize_tenant_id(tenant_id: str) -> str:
    return str(tenant_id or "").strip().lower()


def tenant_filter(tenant_id: str) -> dict:
    return {"tenantId": {"$regex": f"^{re.escape(normalize_tenant_id(tenant_id))}$", "$options": "i"}}


def counter_filter(tenant_id: str) -> dict:
    return {
        "_id": {
            "$regex": f"^[A-Za-z0-9_]+:{re.escape(normalize_tenant_id(tenant_id))}$",
            "$options": "i",
        }
    }


def filter_for(collection: str, tenant_id: str) -> dict:
    return counter_filter(tenant_id) if collection == COUNTERS else tenant_filter(tenant_id)


def belongs_to(collection: str, doc: dict, tenant_id: str) -> bool:
    wanted = normalize_tenant_id(tenant_id)
    if collection == COUNTERS:
        doc_id = doc.get("_id")
        return isinstance(doc_id, str) and ":" in doc_id and doc_id.split(":", 1)[1].lower() == wanted
    value = doc.get("tenantId")
    return isinstance(value, str) and value.strip().lower() == wanted


def store_collections(db) -> list[str]:
    """Every collection that may hold this store's documents, sorted."""
    names = []
    for name in db.list_collection_names():
        if name.startswith("system.") or name in EXCLUDED_COLLECTIONS:
            continue
        names.append(name)
    return sorted(names)


def tenant_presence(db, tenant_id: str) -> dict[str, int]:
    """collection -> number of this store's documents in `db` (non-zero only)."""
    present = {}
    for name in store_collections(db):
        count = db[name].count_documents(filter_for(name, tenant_id))
        if count:
            present[name] = count
    return present


# --- helpers ------------------------------------------------------------------


def _strip_path(doc: dict, dotted: str) -> None:
    parts = dotted.split(".")
    target = doc
    for part in parts[:-1]:
        target = target.get(part) if isinstance(target, dict) else None
        if not isinstance(target, dict):
            return
    target.pop(parts[-1], None)


def redact(collection: str, doc: dict) -> dict:
    for field in SENSITIVE_FIELDS.get(collection, {}):
        _strip_path(doc, field)
    return doc


def _iso(value) -> str | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return None if value is None else str(value)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def read_jsonl(path: Path) -> Iterator[dict]:
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                doc = json_util.loads(line, json_options=_CANONICAL)
            except (ValueError, TypeError) as error:
                raise ImportRefused(f"{path.name} line {line_no}: invalid Extended JSON ({error})") from error
            if not isinstance(doc, dict) or "_id" not in doc:
                raise ImportRefused(f"{path.name} line {line_no}: not a document with an _id")
            yield doc


def migration_state(db) -> list[dict]:
    return [
        {"id": doc["_id"], "name": doc.get("name"), "appliedAt": _iso(doc.get("appliedAt"))}
        for doc in sorted(db["schema_migrations"].find({}), key=lambda d: str(d["_id"]))
    ]


# --- export ---------------------------------------------------------------------


def export_store(
    db,
    tenant_id: str,
    out_dir: str | os.PathLike,
    *,
    mode: str = MODE_FULL,
    source_label: str = "",
    log: Callable[[str], None] = print,
    allow_missing_tenant: bool = False,
) -> dict:
    """Write the store's documents + manifest.json to out_dir (which must be empty)."""
    if mode not in {MODE_FULL, MODE_HANDOVER}:
        raise ExportError(f"Unknown mode {mode!r}")
    tenant_id = normalize_tenant_id(tenant_id)
    if not tenant_id:
        raise ExportError("tenantId is required")
    out = Path(out_dir)
    if out.exists() and any(out.iterdir()):
        raise ExportError(f"Output directory {out} is not empty; choose a new directory.")

    tenant_docs = list(db[TENANTS].find(tenant_filter(tenant_id)))
    if len(tenant_docs) > 1:
        raise ExportError(f"{len(tenant_docs)} tenant documents match {tenant_id!r}; resolve that first.")
    if not tenant_docs and not allow_missing_tenant:
        raise ExportError(f"No tenant document with tenantId {tenant_id!r}.")
    tenant_doc = tenant_docs[0] if tenant_docs else {}

    out.mkdir(parents=True, exist_ok=True)
    options = _CANONICAL if mode == MODE_FULL else _RELAXED
    collections: dict[str, dict] = {}
    omitted: list[str] = []
    for name in store_collections(db):
        if mode == MODE_HANDOVER and name not in HANDOVER_COLLECTIONS:
            if db[name].count_documents(filter_for(name, tenant_id)):
                omitted.append(name)
            continue
        path = out / f"{name}.jsonl"
        count = 0
        handle = None
        try:
            for doc in db[name].find(filter_for(name, tenant_id)).sort("_id", 1):
                if handle is None:
                    handle = path.open("w", encoding="utf-8", newline="\n")
                if mode == MODE_HANDOVER:
                    doc = redact(name, doc)
                handle.write(json_util.dumps(doc, json_options=options))
                handle.write("\n")
                count += 1
        finally:
            if handle is not None:
                handle.close()
        if count:
            collections[name] = {"file": path.name, "count": count, "sha256": _file_sha256(path)}
            log(f"  {name}: {count}")

    manifest = {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "mode": mode,
        "tenantId": tenant_id,
        "tenant": {
            "_id": str(tenant_doc.get("_id")) if tenant_doc else None,
            "name": tenant_doc.get("name"),
            "slug": tenant_doc.get("slug") or tenant_doc.get("deletedSlug"),
            "businessType": tenant_doc.get("businessType"),
            "isActive": tenant_doc.get("isActive"),
            "deletedAt": _iso(tenant_doc.get("deletedAt")),
        },
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"database": getattr(db, "name", None), "label": source_label},
        "extendedJson": "canonical" if mode == MODE_FULL else "relaxed",
        "collections": collections,
        "schemaMigrations": migration_state(db),
        "sensitive": {
            "strippedInThisExport": mode == MODE_HANDOVER,
            "fields": SENSITIVE_FIELDS,
            "personalData": PERSONAL_DATA_COLLECTIONS,
            "notes": [
                "A full export contains password hashes, reset tokens and the "
                "encrypted Delhivery token: store it like a database backup "
                "(encrypted at rest, access-controlled) and never hand it over as is.",
                "Product/banner/logo images live in S3 under tenants/<tenantId>/ "
                "and are not included.",
            ],
        },
        "omittedCollections": omitted,
    }
    (out / MANIFEST).write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    return manifest


# --- validation / import -------------------------------------------------------------


def load_manifest(export_dir: str | os.PathLike) -> dict:
    path = Path(export_dir) / MANIFEST
    if not path.is_file():
        raise ImportRefused(f"{path} not found (incomplete or not an export directory).")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise ImportRefused(f"manifest.json is not valid JSON: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
        raise ImportRefused("manifest.json is not a Retail Cosmos store export.")
    if manifest.get("formatVersion") != FORMAT_VERSION:
        raise ImportRefused(f"Unsupported export formatVersion {manifest.get('formatVersion')!r}.")
    if manifest.get("mode") != MODE_FULL or manifest.get("extendedJson") != "canonical":
        raise ImportRefused("Only full (canonical) exports can be imported; handover exports are redacted.")
    if not normalize_tenant_id(manifest.get("tenantId")):
        raise ImportRefused("manifest.json has no tenantId.")
    if not isinstance(manifest.get("collections"), dict):
        raise ImportRefused("manifest.json has no collections map.")
    return manifest


def validate_export(export_dir: str | os.PathLike) -> dict:
    """Check manifest, checksums, counts and that every document belongs to the store."""
    base = Path(export_dir)
    manifest = load_manifest(base)
    tenant_id = normalize_tenant_id(manifest["tenantId"])
    if TENANTS not in manifest["collections"]:
        raise ImportRefused("Export has no tenants.jsonl (the tenant document is required).")
    for name, entry in manifest["collections"].items():
        if (
            not _SAFE_COLLECTION.match(name)
            or name.startswith("system.")
            or name in EXCLUDED_COLLECTIONS
        ):
            raise ImportRefused(f"Refusing collection name {name!r}.")
        if not isinstance(entry, dict) or entry.get("file") != f"{name}.jsonl":
            raise ImportRefused(f"{name}: manifest file entry must be {name}.jsonl.")
        path = base / entry["file"]
        if not path.is_file():
            raise ImportRefused(f"{name}: {path.name} is missing.")
        if _file_sha256(path) != entry.get("sha256"):
            raise ImportRefused(f"{name}: checksum mismatch (file changed or corrupted).")
        count = 0
        for doc in read_jsonl(path):
            count += 1
            if not belongs_to(name, doc, tenant_id):
                raise ImportRefused(
                    f"{name}: document {doc.get('_id')!r} does not belong to tenant {tenant_id!r}."
                )
        if count != entry.get("count"):
            raise ImportRefused(f"{name}: manifest says {entry.get('count')} documents, file has {count}.")
        if name == TENANTS and count != 1:
            raise ImportRefused(f"tenants.jsonl must contain exactly 1 document, found {count}.")
    return manifest


def _chunks(items: Iterable[dict], size: int = _CHUNK) -> Iterator[list[dict]]:
    batch: list[dict] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _check_conflicts(db, base: Path, manifest: dict, tenant_id: str) -> None:
    """Refuse if restoring would collide with *another* store's data."""
    tenant_doc = next(read_jsonl(base / manifest["collections"][TENANTS]["file"]))
    for field in ("slug", "email"):
        value = tenant_doc.get(field)
        if not isinstance(value, str) or not value:
            continue
        for other in db[TENANTS].find({field: value}, {"tenantId": 1}):
            if not belongs_to(TENANTS, other, tenant_id):
                raise ImportRefused(
                    f"Target already has another store ({other.get('tenantId')!r}) with {field} {value!r}."
                )
    for name, entry in manifest["collections"].items():
        for batch in _chunks(read_jsonl(base / entry["file"])):
            ids = [doc["_id"] for doc in batch]
            for other in db[name].find({"_id": {"$in": ids}}):
                if not belongs_to(name, other, tenant_id):
                    raise ImportRefused(
                        f"{name}: _id {other['_id']!r} already exists in the target and belongs "
                        f"to another store ({other.get('tenantId')!r})."
                    )


def _schema_mismatch(db, manifest: dict) -> tuple[list[str], list[str]]:
    exported = {m.get("id") for m in manifest.get("schemaMigrations") or []}
    target = {m["id"] for m in migration_state(db)}
    return sorted(exported - target), sorted(target - exported)


def import_store(
    db,
    export_dir: str | os.PathLike,
    *,
    replace: bool = False,
    backup_dir: str | os.PathLike | None = None,
    allow_schema_mismatch: bool = False,
    log: Callable[[str], None] = print,
) -> dict:
    """Validate everything, then restore one store into `db`.

    Refuses (ImportRefused, nothing written) when the manifest/files are
    invalid, the store already has data in the target and replace is False,
    another store's slug/email/_ids collide, or the schema_migrations state
    differs (unless allow_schema_mismatch).

    With replace=True the store's current documents in the target are first
    exported to backup_dir, then deleted (only documents matching this
    tenantId), then the export is inserted. The tenant document is inserted
    last, so the storefront does not resolve until the rest is in place.
    """
    base = Path(export_dir)
    manifest = validate_export(base)
    tenant_id = normalize_tenant_id(manifest["tenantId"])
    log(f"Export valid: tenant {tenant_id!r}, exported {manifest.get('exportedAt')}")

    existing = tenant_presence(db, tenant_id)
    if existing and not replace:
        raise ImportRefused(
            f"Tenant {tenant_id!r} already has data in the target ({existing}). "
            "Use --replace to delete it and restore the export."
        )
    export_ahead, target_ahead = _schema_mismatch(db, manifest)
    if (export_ahead or target_ahead) and not allow_schema_mismatch:
        raise ImportRefused(
            "schema_migrations differ between export and target "
            f"(only in export: {export_ahead or '-'}; only in target: {target_ahead or '-'}). "
            "If the target has extra migrations, import with --allow-schema-mismatch and then "
            "run `python -m app.migrations rerun <id>` for each; if the export has extra ones, "
            "migrate the target first."
        )
    _check_conflicts(db, base, manifest, tenant_id)

    backup_manifest = None
    if existing:
        if backup_dir is None:
            raise ImportRefused("replace needs a backup_dir for the current data.")
        log(f"Backing up current data of {tenant_id!r} to {backup_dir}")
        backup_manifest = export_store(
            db, tenant_id, backup_dir, log=log, allow_missing_tenant=True,
            source_label="pre-replace backup",
        )
        for name in store_collections(db):
            deleted = db[name].delete_many(filter_for(name, tenant_id)).deleted_count
            if deleted:
                log(f"  deleted {deleted} from {name}")

    order = sorted(n for n in manifest["collections"] if n != TENANTS) + [TENANTS]
    inserted: dict[str, int] = {}
    try:
        for name in order:
            entry = manifest["collections"][name]
            total = 0
            for batch in _chunks(read_jsonl(base / entry["file"])):
                db[name].insert_many(batch, ordered=True)
                total += len(batch)
            inserted[name] = total
            log(f"  restored {name}: {total}")
    except PyMongoError as error:
        raise RuntimeError(
            f"Import failed part-way ({error}). Restored so far: {inserted}. "
            "Fix the cause and run the import again with --replace"
            + (f"; the previous data is in {backup_dir}." if backup_manifest else ".")
        ) from error

    mismatches = {}
    for name, entry in manifest["collections"].items():
        actual = db[name].count_documents(filter_for(name, tenant_id))
        if actual != entry["count"]:
            mismatches[name] = (actual, entry["count"])
    if mismatches:
        raise RuntimeError(f"Post-import counts differ (target, export): {mismatches}")
    return {
        "tenantId": tenant_id,
        "inserted": inserted,
        "replaced": bool(existing),
        "backupDir": str(backup_dir) if backup_manifest else None,
        "schemaOnlyInTarget": target_ahead,
    }
