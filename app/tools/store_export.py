"""Export one store's data (read-only).

    python -m app.tools.store_export --tenant demo-store --out backups/demo-store-2026-09-24
    python -m app.tools.store_export --tenant demo-store --out handover/demo-store --handover

Full exports (default) are restorable with app.tools.store_import and contain
secrets; --handover strips secrets and platform-internal collections for a
store owner who is leaving. See app/tools/store_data.py and
docs/data-operations.md.
"""

from __future__ import annotations

import argparse
import sys

from app.tools import store_data
from app.tools.mongo_connection import connect, describe_target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tools.store_export", description=__doc__.splitlines()[0])
    parser.add_argument("--tenant", required=True, help="tenantId of the store")
    parser.add_argument("--out", required=True, help="New (or empty) output directory")
    parser.add_argument("--handover", action="store_true", help="Redacted export for the store owner")
    parser.add_argument("--mongo-uri", help="Override MONGO_URI (default: env/.env)")
    parser.add_argument("--db", help="Override DATABASE_NAME (default: env/.env)")
    args = parser.parse_args(argv)

    target = describe_target(args.mongo_uri, args.db)
    print(f"Source (read-only): {target}")
    client, db = connect(args.mongo_uri, args.db)
    try:
        manifest = store_data.export_store(
            db,
            args.tenant,
            args.out,
            mode=store_data.MODE_HANDOVER if args.handover else store_data.MODE_FULL,
            source_label=target,
        )
    except store_data.ExportError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    finally:
        client.close()
    total = sum(entry["count"] for entry in manifest["collections"].values())
    print(f"Exported {total} documents in {len(manifest['collections'])} collections to {args.out}")
    if manifest["omittedCollections"]:
        print("Omitted (platform-internal): " + ", ".join(manifest["omittedCollections"]))
    if not args.handover:
        print("This export contains password hashes and encrypted tokens: keep it private.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
