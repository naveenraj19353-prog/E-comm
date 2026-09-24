import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from bson import Decimal128, ObjectId

from app.tools import store_data, store_import
from tests.mongo_fakes import FakeDatabase

NOW = datetime(2026, 9, 1, 12, 30, 15, 123000, tzinfo=timezone.utc)


def _seed(db, migrations=("0001",)):
    for migration_id in migrations:
        db["schema_migrations"].insert_one({"_id": migration_id, "name": "x", "appliedAt": NOW})
    tenant_oid = ObjectId()
    db["tenants"].insert_one(
        {
            "_id": tenant_oid,
            "tenantId": "shop-a",
            "slug": "shop-a",
            "email": "owner@a.example",
            "name": "Shop A",
            "password": "$2b$hash",
            "resetToken": "tok",
            "billing": {"status": "trialing", "razorpaySubscriptionId": "sub_1"},
            "inrPerUnit": 1,
            "createdAt": NOW,
        }
    )
    db["tenants"].insert_one({"_id": ObjectId(), "tenantId": "shop-b", "slug": "shop-b", "email": "b@x"})
    user_id = ObjectId()
    db["users"].insert_one(
        {"_id": user_id, "tenantId": "shop-a", "email": "c@a.example", "password": "$2b$u", "role": "customer"}
    )
    db["users"].insert_one({"_id": ObjectId(), "tenantId": None, "role": "super_admin", "email": "root@x"})
    db["users"].insert_one({"_id": ObjectId(), "tenantId": "shop-b", "role": "customer", "email": "c@b"})
    order_id = ObjectId()
    db["orders"].insert_one(
        {
            "_id": order_id,
            "tenantId": "shop-a",
            "userId": user_id,
            "orderNumber": 1,
            "totalAmount": 860.5,
            "subtotal": 800.0,
            "quantityInt": 3,
            "precise": Decimal128("10.10"),
            "items": [{"productId": ObjectId(), "price": 800}],
            "createdAt": NOW,
        }
    )
    db["orders"].insert_one({"_id": ObjectId(), "tenantId": "Shop-A", "orderNumber": 2})  # legacy casing
    db["orders"].insert_one({"_id": ObjectId(), "tenantId": "shop-b", "orderNumber": 1})
    db["shipments"].insert_one({"_id": ObjectId(), "tenantId": "shop-a", "orderId": str(order_id)})
    db["shipping_integrations"].insert_one(
        {"_id": ObjectId(), "tenantId": "shop-a", "provider": "delhivery", "apiTokenEncrypted": "gAAAA"}
    )
    db["payment_intents"].insert_one({"_id": ObjectId(), "tenantId": "shop-a", "userId": str(user_id)})
    db["counters"].insert_one({"_id": "orders:shop-a", "seq": 2})
    db["counters"].insert_one({"_id": "orders:shop-b", "seq": 1})
    db["rate_limits"].insert_one({"_id": "login:abc:1", "tenantId": "shop-a", "count": 1})
    db["customer_otps"].insert_one({"_id": ObjectId(), "tenantId": "shop-a", "codeHash": "h"})
    return {"order_id": order_id, "user_id": user_id, "tenant_oid": tenant_oid}


def _docs(db, collection, tenant="shop-a"):
    return sorted(
        db[collection].find(store_data.filter_for(collection, tenant)), key=lambda d: repr(d["_id"])
    )


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = FakeDatabase("prod")
        _seed(self.db)
        self.out = Path(self.tmp.name) / "export"

    def _export(self, **kwargs):
        return store_data.export_store(self.db, "shop-a", self.out, log=lambda _: None, **kwargs)

    def test_full_export_contains_only_this_store(self):
        manifest = self._export()
        counts = {name: entry["count"] for name, entry in manifest["collections"].items()}
        self.assertEqual(
            counts,
            {
                "counters": 1,
                "orders": 2,
                "payment_intents": 1,
                "shipments": 1,
                "shipping_integrations": 1,
                "tenants": 1,
                "users": 1,
            },
        )
        self.assertNotIn("rate_limits", counts)
        self.assertNotIn("customer_otps", counts)
        self.assertNotIn("schema_migrations", counts)
        self.assertEqual(manifest["schemaMigrations"][0]["id"], "0001")
        self.assertIn("apiTokenEncrypted", manifest["sensitive"]["fields"]["shipping_integrations"])
        self.assertIn("password", manifest["sensitive"]["fields"]["users"])
        self.assertFalse(manifest["sensitive"]["strippedInThisExport"])
        users = (self.out / "users.jsonl").read_text()
        self.assertIn("$2b$u", users)  # full export keeps hashes (restorable)
        self.assertNotIn("root@x", users)
        self.assertIn('"$oid"', (self.out / "orders.jsonl").read_text())
        self.assertIn('"$numberInt"', (self.out / "orders.jsonl").read_text())
        self.assertTrue(json.loads((self.out / "manifest.json").read_text())["collections"])

    def test_refuses_non_empty_output_and_unknown_tenant(self):
        self.out.mkdir()
        (self.out / "x.txt").write_text("x")
        with self.assertRaises(store_data.ExportError):
            self._export()
        with self.assertRaises(store_data.ExportError):
            store_data.export_store(self.db, "nope", Path(self.tmp.name) / "n", log=lambda _: None)

    def test_handover_export_strips_secrets_and_internal_collections(self):
        manifest = self._export(mode=store_data.MODE_HANDOVER)
        self.assertEqual(
            sorted(manifest["omittedCollections"]),
            ["counters", "payment_intents", "shipping_integrations"],
        )
        self.assertNotIn("shipping_integrations", manifest["collections"])
        tenant_text = (self.out / "tenants.jsonl").read_text()
        for secret in ("$2b$hash", "resetToken", "sub_1"):
            self.assertNotIn(secret, tenant_text)
        self.assertIn("trialing", tenant_text)
        self.assertNotIn("$2b$u", (self.out / "users.jsonl").read_text())
        self.assertTrue(manifest["sensitive"]["strippedInThisExport"])
        with self.assertRaises(store_data.ImportRefused):
            store_data.validate_export(self.out)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = FakeDatabase("prod")
        self.ids = _seed(self.source)
        self.dir = Path(self.tmp.name) / "export"
        store_data.export_store(self.source, "shop-a", self.dir, log=lambda _: None)

    def _target(self, migrations=("0001",)):
        db = FakeDatabase("restore")
        for migration_id in migrations:
            db["schema_migrations"].insert_one({"_id": migration_id, "name": "x", "appliedAt": NOW})
        return db

    def _import(self, db, **kwargs):
        return store_data.import_store(db, self.dir, log=lambda _: None, **kwargs)

    def test_round_trip_preserves_documents_and_types(self):
        target = self._target()
        result = self._import(target)
        self.assertFalse(result["replaced"])
        for name in ("tenants", "users", "orders", "shipments", "shipping_integrations", "payment_intents", "counters"):
            self.assertEqual(_docs(target, name), _docs(self.source, name), name)
        order = target["orders"].find_one({"_id": self.ids["order_id"]})
        self.assertIs(type(order["quantityInt"]), int)
        self.assertIs(type(order["subtotal"]), float)
        self.assertIsInstance(order["precise"], Decimal128)
        self.assertIsInstance(order["userId"], ObjectId)
        self.assertEqual(order["createdAt"], NOW)
        self.assertIsNotNone(order["createdAt"].tzinfo)
        self.assertEqual(target["counters"].find_one({"_id": "orders:shop-a"})["seq"], 2)
        self.assertIsNone(target["users"].find_one({"role": "super_admin"}))

    def test_refuses_when_store_exists_without_replace(self):
        target = self._target()
        target["orders"].insert_one({"_id": ObjectId(), "tenantId": "shop-a"})
        before = _docs(target, "orders")
        with self.assertRaises(store_data.ImportRefused):
            self._import(target)
        self.assertEqual(_docs(target, "orders"), before)
        self.assertEqual(_docs(target, "tenants"), [])

    def test_replace_backs_up_deletes_only_this_store_and_restores(self):
        target = self._target()
        self._import(target)
        stray = target["products"].insert_one({"_id": ObjectId(), "tenantId": "shop-a", "name": "new"}).inserted_id
        target["orders"].update_one({"_id": self.ids["order_id"]}, {"$set": {"totalAmount": 1.0}})
        other = target["orders"].insert_one({"_id": ObjectId(), "tenantId": "shop-b"}).inserted_id
        target["counters"].insert_one({"_id": "orders:shop-b", "seq": 9})
        backup = Path(self.tmp.name) / "backup"

        result = self._import(target, replace=True, backup_dir=backup)

        self.assertTrue(result["replaced"])
        self.assertIsNone(target["products"].find_one({"_id": stray}))
        self.assertEqual(target["orders"].find_one({"_id": self.ids["order_id"]})["totalAmount"], 860.5)
        self.assertIsNotNone(target["orders"].find_one({"_id": other}))
        self.assertEqual(target["counters"].find_one({"_id": "orders:shop-b"})["seq"], 9)
        backup_manifest = json.loads((backup / "manifest.json").read_text())
        self.assertEqual(backup_manifest["collections"]["products"]["count"], 1)
        self.assertIn("1.0", (backup / "orders.jsonl").read_text())

    def test_replace_requires_backup_dir(self):
        target = self._target()
        self._import(target)
        with self.assertRaises(store_data.ImportRefused):
            self._import(target, replace=True)

    def test_checksum_mismatch_refused(self):
        path = self.dir / "orders.jsonl"
        path.write_text(path.read_text().replace("860.5", "1.5"))
        target = self._target()
        with self.assertRaises(store_data.ImportRefused) as ctx:
            self._import(target)
        self.assertIn("checksum", str(ctx.exception))
        self.assertEqual(target.list_collection_names(), ["schema_migrations"])

    def test_foreign_document_refused_even_with_valid_checksum(self):
        path = self.dir / "orders.jsonl"
        path.write_text(path.read_text() + '{"_id": {"$oid": "%s"}, "tenantId": "shop-b"}\n' % ObjectId())
        manifest = json.loads((self.dir / "manifest.json").read_text())
        manifest["collections"]["orders"]["count"] += 1
        manifest["collections"]["orders"]["sha256"] = store_data._file_sha256(path)
        (self.dir / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaises(store_data.ImportRefused) as ctx:
            store_data.validate_export(self.dir)
        self.assertIn("does not belong", str(ctx.exception))

    def test_count_mismatch_and_missing_manifest_refused(self):
        manifest = json.loads((self.dir / "manifest.json").read_text())
        manifest["collections"]["users"]["count"] = 5
        (self.dir / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaises(store_data.ImportRefused):
            store_data.validate_export(self.dir)
        (self.dir / "manifest.json").unlink()
        with self.assertRaises(store_data.ImportRefused):
            store_data.validate_export(self.dir)

    def test_schema_mismatch_refused_unless_allowed(self):
        target = self._target(migrations=("0001", "0002"))
        with self.assertRaises(store_data.ImportRefused) as ctx:
            self._import(target)
        self.assertIn("0002", str(ctx.exception))
        result = self._import(target, allow_schema_mismatch=True)
        self.assertEqual(result["schemaOnlyInTarget"], ["0002"])

    def test_slug_taken_by_another_store_refused(self):
        target = self._target()
        target["tenants"].insert_one({"_id": ObjectId(), "tenantId": "other", "slug": "shop-a"})
        with self.assertRaises(store_data.ImportRefused):
            self._import(target)
        self.assertEqual(_docs(target, "orders"), [])

    def test_id_owned_by_another_store_refused(self):
        target = self._target()
        target["orders"].insert_one({"_id": self.ids["order_id"], "tenantId": "shop-b"})
        with self.assertRaises(store_data.ImportRefused):
            self._import(target)


class ImportCliTests(unittest.TestCase):
    def test_requires_explicit_write_flag(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = store_import.main(["--dir", "does-not-matter", "--target-db", "x"])
        self.assertEqual(code, 2)
        self.assertIn("--i-understand-this-writes", stderr.getvalue())

    def test_validate_only_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = FakeDatabase()
            _seed(db)
            store_data.export_store(db, "shop-a", Path(tmp) / "e", log=lambda _: None)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = store_import.main(["--dir", str(Path(tmp) / "e"), "--validate-only"])
        self.assertEqual(code, 0)
        self.assertIn("Valid export of 'shop-a'", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
