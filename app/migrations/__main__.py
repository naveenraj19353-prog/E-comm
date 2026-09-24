"""CLI: python -m app.migrations status | up [--dry-run] [--to NNNN] | rerun NNNN | unlock"""

from __future__ import annotations

import argparse
import sys

from app.migrations import runner
from app.tools.mongo_connection import confirm, connect, describe_target, resolve_settings


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.migrations",
        description="Run versioned data migrations. Never runs automatically.",
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--mongo-uri", help="Override MONGO_URI (default: env/.env)")
    common.add_argument("--db", help="Override DATABASE_NAME (default: env/.env)")

    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", parents=[common], help="List migrations and whether each is applied")

    up = sub.add_parser("up", parents=[common], help="Apply pending migrations in order")
    up.add_argument("--dry-run", action="store_true", help="Report only; takes no lock, writes nothing")
    up.add_argument("--to", metavar="NNNN", help="Apply up to and including this id")
    up.add_argument("--yes", action="store_true", help="Skip the type-the-database-name prompt")

    rerun = sub.add_parser(
        "rerun",
        parents=[common],
        help="Run one already-applied (idempotent) migration again, e.g. after an import",
    )
    rerun.add_argument("id", metavar="NNNN")
    rerun.add_argument("--dry-run", action="store_true")
    rerun.add_argument("--yes", action="store_true")

    unlock = sub.add_parser("unlock", parents=[common], help="Remove a stale runner lock")
    unlock.add_argument("--yes", action="store_true")
    return parser


def _fmt(value) -> str:
    return "-" if value is None else str(value)


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _uri, db_name = resolve_settings(args.mongo_uri, args.db)
    print(f"Target: {describe_target(args.mongo_uri, args.db)}")
    client, db = connect(args.mongo_uri, args.db)
    try:
        migrations = runner.discover_migrations()

        if args.command == "status":
            for row in runner.status(db, migrations):
                mark = "applied" if row["applied"] else "PENDING"
                print(
                    f"  {row['id']}  {mark:8}  {row['name']:32} "
                    f"appliedAt={_fmt(row['appliedAt'])} durationMs={_fmt(row['durationMs'])}"
                )
                if row["description"]:
                    print(f"        {row['description']}")
            lock = db[runner.LOCK_COLLECTION].find_one({"_id": runner.LOCK_ID})
            if lock:
                print(f"Lock held by {lock.get('owner')} until {lock.get('expiresAt')}")
            return 0

        if args.command == "unlock":
            confirm(db_name, assume_yes=args.yes, what="remove the migration lock")
            held = runner.force_unlock(db)
            print(f"Removed lock: {held}" if held else "No lock was held.")
            return 0

        if args.command == "rerun":
            selected = [m for m in migrations if m.id == args.id]
            if not selected:
                print(f"Unknown migration id {args.id!r}", file=sys.stderr)
                return 2
            rerun = True
        else:
            selected = runner.pending_migrations(db, migrations, target=args.to)
            rerun = False

        if not selected:
            print("Nothing to do: no pending migrations.")
            return 0
        print("Will run: " + ", ".join(m.full_name for m in selected))
        if not args.dry_run:
            confirm(db_name, assume_yes=args.yes, what="apply these migrations")
        runner.run(db, selected, dry_run=args.dry_run, rerun=rerun)
        return 0
    except runner.MigrationError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
