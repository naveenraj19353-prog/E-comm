import sys
import tempfile
import textwrap
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType

from app.migrations import runner
from tests.mongo_fakes import FakeDatabase


def _module(name, up, doc="Test migration."):
    module = ModuleType(name)
    module.__doc__ = doc
    module.up = up
    return module


def _migration(migration_id, name, up):
    return runner.Migration(migration_id, name, _module(f"{migration_id}_{name}", up))


class DiscoveryTests(unittest.TestCase):
    def _package(self, files):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        package = f"fake_migrations_{uuid.uuid4().hex[:8]}"
        pkg_dir = Path(root.name) / package
        pkg_dir.mkdir()
        (pkg_dir / "__init__.py").write_text("")
        for filename, body in files.items():
            (pkg_dir / filename).write_text(textwrap.dedent(body))
        sys.path.insert(0, root.name)
        self.addCleanup(sys.path.remove, root.name)
        return package

    def test_real_package_contains_backfill(self):
        migrations = runner.discover_migrations()
        self.assertEqual(migrations[0].id, "0001")
        self.assertEqual(migrations[0].name, "backfill_order_numbers")
        self.assertTrue(migrations[0].accepts("dry_run"))
        self.assertTrue(migrations[0].description)

    def test_orders_by_id_and_ignores_other_modules(self):
        body = '"""Doc."""\ndef up(db):\n    pass\n'
        package = self._package(
            {"0010_c.py": body, "0002_b.py": body, "0001_a.py": body, "helpers.py": "X = 1\n"}
        )
        ids = [m.full_name for m in runner.discover_migrations(package)]
        self.assertEqual(ids, ["0001_a", "0002_b", "0010_c"])

    def test_duplicate_ids_rejected(self):
        body = '"""Doc."""\ndef up(db):\n    pass\n'
        package = self._package({"0001_a.py": body, "0001_b.py": body})
        with self.assertRaises(runner.MigrationError):
            runner.discover_migrations(package)

    def test_docstring_required(self):
        package = self._package({"0001_a.py": "def up(db):\n    pass\n"})
        with self.assertRaises(runner.MigrationError):
            runner.discover_migrations(package)


class RunTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.calls = []

        def make(tag):
            def up(db, *, dry_run=False, log=print):
                self.calls.append((tag, dry_run))
                if not dry_run:
                    db["things"].update_one({"_id": tag}, {"$set": {"done": True}}, upsert=True)
                return {"tag": tag}

            return up

        self.migrations = [
            _migration("0002", "second", make("b")),
            _migration("0001", "first", make("a")),
            _migration("0003", "third", make("c")),
        ]
        self.log = []

    def _run(self, migrations, **kwargs):
        return runner.run(self.db, migrations, log=self.log.append, **kwargs)

    def test_applies_in_id_order_and_records(self):
        pending = runner.pending_migrations(self.db, self.migrations)
        self.assertEqual(self._run(pending), ["0001", "0002", "0003"])
        self.assertEqual([c[0] for c in self.calls], ["a", "b", "c"])
        record = self.db["schema_migrations"].find_one({"_id": "0001"})
        self.assertEqual(record["name"], "first")
        self.assertIsInstance(record["appliedAt"], datetime)
        self.assertIn("durationMs", record)
        self.assertEqual(record["summary"], {"tag": "a"})
        self.assertIsNone(self.db[runner.LOCK_COLLECTION].find_one({"_id": runner.LOCK_ID}))

    def test_second_run_has_nothing_pending(self):
        self._run(runner.pending_migrations(self.db, self.migrations))
        self.calls.clear()
        self.assertEqual(runner.pending_migrations(self.db, self.migrations), [])
        self.assertEqual(self._run([]), [])
        self.assertEqual(self.calls, [])

    def test_already_applied_migration_is_skipped_inside_the_lock(self):
        self._run(runner.pending_migrations(self.db, self.migrations, target="0001"))
        self.calls.clear()
        # Stale list (as if read before another runner applied 0001).
        self._run(sorted(self.migrations, key=lambda m: m.id))
        self.assertEqual([c[0] for c in self.calls], ["b", "c"])

    def test_target_stops_at_id(self):
        pending = runner.pending_migrations(self.db, self.migrations, target="0002")
        self.assertEqual([m.id for m in pending], ["0001", "0002"])
        with self.assertRaises(runner.MigrationError):
            runner.pending_migrations(self.db, self.migrations, target="0099")

    def test_status_rows(self):
        self._run(runner.pending_migrations(self.db, self.migrations, target="0001"))
        self.db["schema_migrations"].insert_one({"_id": "0999", "name": "gone"})
        rows = {r["id"]: r for r in runner.status(self.db, sorted(self.migrations, key=lambda m: m.id))}
        self.assertTrue(rows["0001"]["applied"])
        self.assertFalse(rows["0002"]["applied"])
        self.assertIn("not found in code", rows["0999"]["description"])

    def test_dry_run_writes_nothing(self):
        without_dry_run = _migration("0004", "no_dry", lambda db: self.calls.append(("d", None)))
        self._run(self.migrations + [without_dry_run], dry_run=True)
        self.assertEqual(self.calls, [("a", True), ("b", True), ("c", True)])
        self.assertEqual(self.db.list_collection_names(), [])
        self.assertTrue(any("no dry-run support" in line for line in self.log))

    def test_failure_stops_releases_lock_and_is_not_recorded(self):
        def boom(db):
            raise ValueError("boom")

        migrations = [self.migrations[1], _migration("0002", "boom", boom), self.migrations[2]]
        with self.assertRaises(ValueError):
            self._run(migrations)
        self.assertIsNotNone(self.db["schema_migrations"].find_one({"_id": "0001"}))
        self.assertIsNone(self.db["schema_migrations"].find_one({"_id": "0002"}))
        self.assertNotIn(("c", False), self.calls)
        self.assertIsNone(self.db[runner.LOCK_COLLECTION].find_one({"_id": runner.LOCK_ID}))

    def test_rerun_runs_applied_migration_again(self):
        self._run(runner.pending_migrations(self.db, self.migrations, target="0001"))
        self._run([self.migrations[1]], rerun=True)
        self.assertEqual(self.calls, [("a", False), ("a", False)])
        self.assertEqual(self.db["schema_migrations"].find_one({"_id": "0001"})["runCount"], 2)


class LockTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()

    def test_held_lock_blocks_a_second_runner(self):
        runner.acquire_lock(self.db, "other-host")
        ran = []
        migration = _migration("0001", "x", lambda db: ran.append(1))
        with self.assertRaises(runner.MigrationLockError):
            runner.run(self.db, [migration], log=lambda _: None)
        self.assertEqual(ran, [])
        # The other runner's lock is untouched.
        self.assertEqual(self.db[runner.LOCK_COLLECTION].find_one({})["owner"], "other-host")

    def test_expired_lock_is_taken_over(self):
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        runner.acquire_lock(self.db, "crashed", now=past)
        runner.acquire_lock(self.db, "me")
        self.assertEqual(self.db[runner.LOCK_COLLECTION].find_one({})["owner"], "me")

    def test_release_only_removes_own_lock(self):
        runner.acquire_lock(self.db, "a")
        runner.release_lock(self.db, "b")
        self.assertIsNotNone(self.db[runner.LOCK_COLLECTION].find_one({}))
        runner.release_lock(self.db, "a")
        self.assertIsNone(self.db[runner.LOCK_COLLECTION].find_one({}))

    def test_heartbeat_refreshes_and_detects_lost_lock(self):
        def up(db, heartbeat):
            heartbeat()
            db[runner.LOCK_COLLECTION].update_one(
                {"_id": runner.LOCK_ID}, {"$set": {"owner": "thief"}}
            )
            heartbeat()

        with self.assertRaises(runner.MigrationLockError):
            runner.run(self.db, [_migration("0001", "x", up)], log=lambda _: None)
        self.assertIsNone(self.db["schema_migrations"].find_one({"_id": "0001"}))

    def test_force_unlock(self):
        runner.acquire_lock(self.db, "a")
        self.assertEqual(runner.force_unlock(self.db)["owner"], "a")
        self.assertIsNone(runner.force_unlock(self.db))


if __name__ == "__main__":
    unittest.main()
