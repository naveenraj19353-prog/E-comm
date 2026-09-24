"""Restore one store from a full store_export directory.

    python -m app.tools.store_import --dir backups/demo-store --target-db retail_restore --validate-only
    python -m app.tools.store_import --dir backups/demo-store --target-db retail_restore --i-understand-this-writes
    python -m app.tools.store_import --dir backups/demo-store --replace --i-understand-this-writes

Refuses if the store already has data in the target unless --replace, which
first exports the store's current target data to --backup-dir (default:
<dir>.pre-replace-<timestamp>) and then deletes only that store's documents.
Everything is validated (manifest, checksums, counts, ownership, collisions,
schema_migrations) before anything is written. See docs/data-operations.md.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from app.tools import store_data
from app.tools.mongo_connection import connect, describe_target, is_env_target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tools.store_import", description=__doc__.splitlines()[0])
    parser.add_argument("--dir", required=True, help="Export directory (contains manifest.json)")
    parser.add_argument("--target-db", help="Target database name (default: DATABASE_NAME from env/.env)")
    parser.add_argument("--mongo-uri", help="Target MongoDB URI (default: MONGO_URI from env/.env)")
    parser.add_argument("--replace", action="store_true", help="Delete this store's data in the target first")
    parser.add_argument("--backup-dir", help="Where --replace saves the store's current target data")
    parser.add_argument(
        "--allow-schema-mismatch",
        action="store_true",
        help="Import even if schema_migrations differ (then rerun the target-only migrations)",
    )
    parser.add_argument("--validate-only", action="store_true", help="Validate the export; write nothing")
    parser.add_argument(
        "--i-understand-this-writes",
        dest="confirmed",
        action="store_true",
        help="Required for a real import",
    )
    args = parser.parse_args(argv)

    if args.validate_only:
        try:
            manifest = store_data.validate_export(args.dir)
        except store_data.ImportRefused as error:
            print(f"INVALID: {error}", file=sys.stderr)
            return 1
        counts = {name: entry["count"] for name, entry in manifest["collections"].items()}
        print(f"Valid export of {manifest['tenantId']!r}: {counts}")
        return 0

    if not args.confirmed:
        print(
            "Refusing to write without --i-understand-this-writes "
            "(or use --validate-only).",
            file=sys.stderr,
        )
        return 2

    target = describe_target(args.mongo_uri, args.target_db)
    print(f"Target (WILL BE WRITTEN): {target}")
    if is_env_target(args.mongo_uri, args.target_db):
        print("WARNING: this is the database configured in env/.env (normally production).")

    backup_dir = args.backup_dir
    if args.replace and not backup_dir:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = f"{os.path.normpath(args.dir)}.pre-replace-{stamp}"

    client, db = connect(args.mongo_uri, args.target_db)
    try:
        result = store_data.import_store(
            db,
            args.dir,
            replace=args.replace,
            backup_dir=backup_dir,
            allow_schema_mismatch=args.allow_schema_mismatch,
        )
    except store_data.ImportRefused as error:
        print(f"REFUSED (nothing written): {error}", file=sys.stderr)
        return 1
    except store_data.ExportError as error:
        print(f"REFUSED (backup before replace failed, nothing deleted): {error}", file=sys.stderr)
        return 1
    finally:
        client.close()
    print(f"Restored {result['tenantId']!r}: {result['inserted']}")
    if result["backupDir"]:
        print(f"Previous data saved in {result['backupDir']}")
    for migration_id in result["schemaOnlyInTarget"]:
        print(f"Now run: python -m app.migrations rerun {migration_id} --db <target>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
