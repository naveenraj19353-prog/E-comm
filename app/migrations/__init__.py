"""Versioned, explicitly-run data migrations.

Each migration is a module ``NNNN_short_name.py`` in this package with a
docstring and ``up(db, *, dry_run=False, log=print, heartbeat=None)`` (only
``db`` is required; the runner passes whichever of the optional keyword
arguments the function accepts). Migrations must be idempotent: safe to run
again after a crash part-way through, or via ``rerun``.

Applied migrations are recorded in the ``schema_migrations`` collection; a
lock document in ``schema_migrations_lock`` stops two runners overlapping.

Never run at app startup. Run deliberately:

    python -m app.migrations status
    python -m app.migrations up --dry-run
    python -m app.migrations up [--to NNNN]

See docs/data-operations.md.
"""
