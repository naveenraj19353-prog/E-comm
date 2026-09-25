import copy
import inspect
import re
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from jose import jwt
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.config import SECRET_KEY
from app.models.inventory_receiving import ReceivingCommitRequest, ReceivingPreviewRequest
from app.routes import inventory as inventory_routes
from app.services import inventory_receiving, inventory_receiving_commit, product_duplicates
from app.utils.jwt_handler import create_token

NIKE_ID = ObjectId()
LIGHT_ID = ObjectId()
OTHER_STORE_ID = ObjectId()
ADMIN = {"userId": "u-1", "name": "Owner", "role": "admin", "tenantId": "store-a"}

PRODUCTS = [
    {
        "_id": NIKE_ID,
        "tenantId": "store-a",
        "name": "Nike T-Shirt",
        "description": "Soft cotton",
        "brand": "Nike",
        "categoryId": "T_SHIRTS",
        "categoryName": "T-Shirts",
        "price": 999,
        "discountPercentage": 10,
        "finalPrice": 899.1,
        "images": {"Black": ["tenants/store-a/products/black.jpg"]},
        "isActive": True,
        "isDraft": False,
        "stock": 160,
        "totalStock": 160,
        "averageRating": 4.5,
        "reviewCount": 3,
        "inventory": [
            {"variantId": "NK-TS-BLK-S", "color": "Black", "size": "S", "stock": 20},
            {"variantId": "NK-TS-BLK-M", "color": "Black", "size": "M", "stock": 100},
            {"variantId": "NK-TS-YLW-M", "color": "Yellow", "size": "M", "stock": 40},
        ],
    },
    {
        "_id": LIGHT_ID,
        "tenantId": "store-a",
        "name": "Linen Shirt",
        "categoryId": "SHIRTS",
        "categoryName": "Shirts",
        "isActive": True,
        "totalStock": 2,
        "inventory": [{"variantId": "GEN-SHIR-LIG-M", "color": "Light Blue", "size": "M", "stock": 2}],
    },
    {
        "_id": OTHER_STORE_ID,
        "tenantId": "store-b",
        "name": "Other Tee",
        "categoryId": "T_SHIRTS",
        "categoryName": "T-Shirts",
        "isActive": True,
        "inventory": [{"variantId": "B-1", "color": "Red", "size": "S", "stock": 5}],
    },
]


# --- in-memory MongoDB with transactions -----------------------------------

def _values(doc, path):
    values = [doc]
    for part in path.split("."):
        found = []
        for value in values:
            if isinstance(value, dict) and part in value:
                inner = value[part]
                found.extend(inner if isinstance(inner, list) else [inner])
        values = found
    return values


def _matches(doc, query):
    for key, condition in (query or {}).items():
        values = _values(doc, key)
        if isinstance(condition, dict) and any(op.startswith("$") for op in condition):
            for op, operand in condition.items():
                if op == "$in":
                    ok = any(value in operand for value in values)
                elif op == "$nin":
                    ok = not any(value in operand for value in values)
                elif op == "$elemMatch":
                    ok = any(isinstance(value, dict) and _matches(value, operand) for value in values)
                elif op == "$regex":
                    flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
                    ok = any(isinstance(value, str) and re.search(operand, value, flags) for value in values)
                elif op == "$options":
                    ok = True
                else:
                    raise NotImplementedError(op)
                if not ok:
                    return False
        elif not any(value == condition for value in values):
            return False
    return True


class FakeSession:
    def __init__(self, db):
        self.db = db
        self.in_transaction = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def with_transaction(self, callback, **kwargs):
        """All-or-nothing like a MongoDB transaction: any error restores every collection."""
        self.db.transactions += 1
        snapshot = {name: copy.deepcopy(col.docs) for name, col in self.db.collections.items()}
        self.in_transaction = True
        try:
            return callback(self)
        except BaseException:
            for name, col in self.db.collections.items():
                col.docs = snapshot[name]
            self.db.rollbacks += 1
            raise
        finally:
            self.in_transaction = False


class FakeClient:
    def __init__(self, db):
        self.db = db

    def start_session(self):
        return FakeSession(self.db)


class FakeCollection:
    def __init__(self, db, name, docs=()):
        self.db = db
        self.name = name
        self.docs = copy.deepcopy(list(docs))
        db.collections[name] = self

    def _require_transaction(self, session, operation):
        if session is None or not getattr(session, "in_transaction", False):
            raise AssertionError(f"{self.name}.{operation} was called outside a transaction")
        self.db.writes.append((self.name, operation))

    def find(self, query=None, projection=None, session=None):
        return [copy.deepcopy(doc) for doc in self.docs if _matches(doc, query)]

    def find_one(self, query=None, projection=None, session=None):
        return next((copy.deepcopy(doc) for doc in self.docs if _matches(doc, query)), None)

    def insert_one(self, doc, session=None):
        self._require_transaction(session, "insert_one")
        doc = copy.deepcopy(doc)
        doc.setdefault("_id", ObjectId())
        if any(existing["_id"] == doc["_id"] for existing in self.docs):
            raise DuplicateKeyError("E11000 duplicate key")
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc["_id"])

    def insert_many(self, docs, session=None):
        self._require_transaction(session, "insert_many")
        for doc in docs:
            doc = copy.deepcopy(doc)
            doc.setdefault("_id", ObjectId())
            self.docs.append(doc)

    def update_one(self, query, update, session=None):
        self._require_transaction(session, "update_one")
        self.db.updates.append((self.name, copy.deepcopy(query), copy.deepcopy(update)))
        doc = next((doc for doc in self.docs if _matches(doc, query)), None)
        if doc is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        for op, fields in update.items():
            for path, value in fields.items():
                if op == "$set":
                    doc[path] = copy.deepcopy(value)
                elif op == "$inc" and path.startswith("inventory.$."):
                    element = query["inventory"]["$elemMatch"]
                    item = next(item for item in doc["inventory"] if _matches(item, element))
                    field = path.split(".")[-1]
                    item[field] = item.get(field, 0) + value
                elif op == "$push":
                    doc.setdefault(path, []).extend(copy.deepcopy(value["$each"]))
                else:
                    raise NotImplementedError((op, path))
        return SimpleNamespace(matched_count=1, modified_count=1)

    def __getattr__(self, name):
        raise AssertionError(f"receiving must not call {self.name}.{name}")


class FakeDatabase:
    def __init__(self):
        self.collections = {}
        self.transactions = 0
        self.rollbacks = 0
        self.writes = []
        self.updates = []
        self.products = FakeCollection(self, "products", PRODUCTS)
        self.stock_movements = FakeCollection(self, "stock_movements")
        self.inventory_receivings = FakeCollection(self, "inventory_receivings")

    def product(self, product_id):
        return next(doc for doc in self.products.docs if doc["_id"] == product_id)

    def stock(self, product_id):
        return {item["variantId"]: item["stock"] for item in self.product(product_id)["inventory"]}


def _line(incoming, variant_id=None, color=None, size=None):
    return {"variantId": variant_id, "color": color, "size": size, "incomingStock": incoming}


EXAMPLE = [
    _line(10, color="Black", size="S"),
    _line(20, color="Black", size="M"),
    _line(15, color="Yellow", size="M"),
    _line(30, color="Yellow", size="XL"),
]


class ReceivingCommitTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.invalidated = []
        patches = [
            patch.object(inventory_receiving, "products", self.db.products),
            patch.object(product_duplicates, "products", self.db.products),
            patch.object(inventory_receiving_commit, "products", self.db.products),
            patch.object(inventory_receiving_commit, "stock_movements", self.db.stock_movements),
            patch.object(inventory_receiving_commit, "inventory_receivings", self.db.inventory_receivings),
            patch.object(inventory_receiving_commit, "client", FakeClient(self.db)),
            patch.object(inventory_receiving_commit, "invalidate_tenant", self.invalidated.append),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def preview(self, **payload):
        return inventory_receiving.build_receiving_preview("store-a", ReceivingPreviewRequest(**payload))

    def token(self, **payload):
        return self.preview(**payload)["previewToken"]

    def commit(self, token, user=ADMIN, **fields):
        request = ReceivingCommitRequest(previewToken=token, **fields)
        return inventory_routes.commit_receiving_stock(request, user)

    def assert_commit_fails(self, token, status, code=None, **fields):
        before = {name: copy.deepcopy(col.docs) for name, col in self.db.collections.items()}
        with self.assertRaises(HTTPException) as error:
            self.commit(token, **fields)
        self.assertEqual(error.exception.status_code, status)
        if code:
            self.assertEqual(error.exception.detail["code"], code)
        # Nothing at all was changed by the failed commit.
        self.assertEqual({name: col.docs for name, col in self.db.collections.items()}, before)
        return error.exception.detail


class ExistingProductCommitTests(ReceivingCommitTestCase):
    # A. existing variant: 100 + 20 = 120
    def test_existing_variant_is_increased(self):
        result = self.commit(self.token(productId=str(NIKE_ID), variants=[_line(20, "NK-TS-BLK-M")]))

        self.assertEqual(
            result["variants"],
            [{"variantId": "NK-TS-BLK-M", "color": "Black", "size": "M", "beforeStock": 100,
              "receivedStock": 20, "afterStock": 120, "action": "STOCK_INCREASED"}],
        )
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-M"], 120)
        self.assertEqual(self.db.product(NIKE_ID)["totalStock"], 180)
        self.assertFalse(result["replayed"])
        self.assertEqual(self.db.transactions, 1)
        self.assertEqual(self.invalidated, ["store-a"])

    # B + C + D. several variants, one new, existing variantIds preserved
    def test_multiple_variants_commit_together(self):
        result = self.commit(self.token(productId=str(NIKE_ID), variants=EXAMPLE))

        self.assertEqual(
            [(row["variantId"], row["beforeStock"], row["receivedStock"], row["afterStock"], row["action"])
             for row in result["variants"]],
            [
                ("NK-TS-BLK-S", 20, 10, 30, "STOCK_INCREASED"),
                ("NK-TS-BLK-M", 100, 20, 120, "STOCK_INCREASED"),
                ("NK-TS-YLW-M", 40, 15, 55, "STOCK_INCREASED"),
                ("NI-TSHI-YEL-XL", 0, 30, 30, "VARIANT_CREATED"),
            ],
        )
        self.assertEqual(
            self.db.product(NIKE_ID)["inventory"],
            [
                {"variantId": "NK-TS-BLK-S", "color": "Black", "size": "S", "stock": 30},
                {"variantId": "NK-TS-BLK-M", "color": "Black", "size": "M", "stock": 120},
                {"variantId": "NK-TS-YLW-M", "color": "Yellow", "size": "M", "stock": 55},
                {"variantId": "NI-TSHI-YEL-XL", "color": "Yellow", "size": "XL", "stock": 30},
            ],
        )
        self.assertEqual(self.db.product(NIKE_ID)["totalStock"], 235)
        self.assertEqual(result["totals"], {"beforeStock": 160, "receivedStock": 75, "afterStock": 235})

    # E. product metadata preserved
    def test_product_metadata_is_preserved(self):
        before = copy.deepcopy(self.db.product(NIKE_ID))
        self.commit(self.token(productId=str(NIKE_ID), variants=EXAMPLE))
        after = self.db.product(NIKE_ID)

        unchanged = {key for key in before if key not in {"inventory", "totalStock"}}
        self.assertEqual({key: after[key] for key in unchanged}, {key: before[key] for key in unchanged})
        self.assertEqual(set(after) - set(before), {"updatedAt"})

    # G. zero stock
    def test_zero_incoming_changes_nothing_and_logs_nothing(self):
        result = self.commit(
            self.token(productId=str(NIKE_ID), variants=[_line(0, "NK-TS-BLK-S"), _line(0, color="Green", size="S")])
        )

        self.assertEqual([row["action"] for row in result["variants"]], ["UNCHANGED", "VARIANT_CREATED"])
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-S"], 20)
        self.assertEqual(self.db.stock(NIKE_ID)["NI-TSHI-GRE-S"], 0)
        self.assertEqual(self.db.stock_movements.docs, [])

    # N. stock movements
    def test_every_increase_writes_a_receiving_movement(self):
        result = self.commit(self.token(productId=str(NIKE_ID), variants=EXAMPLE), note="Invoice 42")

        movements = self.db.stock_movements.docs
        self.assertEqual(len(movements), 4)
        by_variant = {doc["variantId"]: doc for doc in movements}
        doc = by_variant["NK-TS-BLK-M"]
        self.assertEqual(doc["source"], "receiving")
        self.assertEqual((doc["change"], doc["stockBefore"], doc["stockAfter"]), (20, 100, 120))
        self.assertEqual(doc["referenceId"], result["receivingId"])
        self.assertEqual(doc["note"], "Invoice 42")
        self.assertEqual((doc["tenantId"], doc["productId"], doc["userId"]), ("store-a", NIKE_ID, "u-1"))
        self.assertEqual((doc["color"], doc["size"]), ("Black", "M"))
        self.assertEqual(
            (by_variant["NI-TSHI-YEL-XL"]["stockBefore"], by_variant["NI-TSHI-YEL-XL"]["stockAfter"]), (0, 30)
        )
        self.assertIsInstance(doc["createdAt"], datetime)

    def test_default_note(self):
        self.commit(self.token(productId=str(NIKE_ID), variants=[_line(1, "NK-TS-BLK-S")]))
        self.assertEqual(self.db.stock_movements.docs[0]["note"], "Admin stock receiving")

    # R. the inventory array is never replaced, and every write is transactional
    def test_only_targeted_updates_inside_one_transaction(self):
        self.commit(self.token(productId=str(NIKE_ID), variants=EXAMPLE))

        for _name, _query, update in self.db.updates:
            self.assertLessEqual(set(update), {"$inc", "$push", "$set"})
            self.assertNotIn("inventory", update.get("$set", {}))
        self.assertEqual(self.db.transactions, 1)
        record = self.db.inventory_receivings.docs[0]
        self.assertEqual((record["tenantId"], record["productId"], record["createdBy"]["userId"]), ("store-a", NIKE_ID, "u-1"))


class StalePreviewTests(ReceivingCommitTestCase):
    def nike_item(self, variant_id):
        return next(item for item in self.db.product(NIKE_ID)["inventory"] if item["variantId"] == variant_id)

    # K. stock changed after preview (e.g. a sale)
    def test_stock_changed_after_preview_is_stale(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(20, "NK-TS-BLK-M")])
        self.nike_item("NK-TS-BLK-M")["stock"] = 99

        detail = self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")
        self.assertEqual(detail["message"], "Stock changed after preview. Refresh the preview before saving.")
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-M"], 99)

    # J. existing variant changed or removed after preview
    def test_variant_changed_or_removed_after_preview_is_stale(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")])
        self.nike_item("NK-TS-BLK-S")["color"] = "Jet Black"
        self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")

        self.db.product(NIKE_ID)["inventory"].pop(0)
        self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")

    # I. product deleted after preview
    def test_product_deleted_after_preview_is_stale(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")])
        self.db.products.docs = [doc for doc in self.db.products.docs if doc["_id"] != NIKE_ID]

        detail = self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")
        self.assertEqual(detail["reason"], "product_missing")

    # L. the same new variant was created by someone else after preview
    def test_new_variant_created_after_preview_is_not_overwritten(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(30, color="Yellow", size="XL")])
        self.db.product(NIKE_ID)["inventory"].append(
            {"variantId": "SOMEONE-ELSE", "color": "yellow", "size": "xl", "stock": 5}
        )

        detail = self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")
        self.assertEqual(detail["reason"], "variant_created_after_preview")
        self.assertEqual(self.db.stock(NIKE_ID)["SOMEONE-ELSE"], 5)

    # O. a failure part-way leaves nothing behind
    def test_failed_multi_variant_commit_leaves_no_partial_changes(self):
        token = self.token(productId=str(NIKE_ID), variants=EXAMPLE)
        self.nike_item("NK-TS-YLW-M")["stock"] = 39  # the 3rd line is now stale
        product_before = copy.deepcopy(self.db.product(NIKE_ID))

        self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")

        # Lines 1 and 2 had been incremented inside the transaction before line 3
        # failed; the rollback removed them.
        self.assertEqual([op for op in self.db.writes if op == ("products", "update_one")], [("products", "update_one")] * 2)
        self.assertEqual(self.db.rollbacks, 1)
        self.assertEqual(self.db.product(NIKE_ID), product_before)
        self.assertEqual(self.db.stock_movements.docs, [])
        self.assertEqual(self.db.inventory_receivings.docs, [])
        self.assertEqual(self.invalidated, [])

    # H. cross-tenant
    def test_other_store_cannot_commit(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")])
        other_admin = {**ADMIN, "tenantId": "store-b"}

        with self.assertRaises(HTTPException) as error:
            self.commit(token, user=other_admin)
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(self.db.writes, [])

    def test_product_moved_to_another_store_is_stale(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")])
        self.db.product(NIKE_ID)["tenantId"] = "store-b"

        self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")

    def test_generated_variant_id_clash_is_rejected(self):
        # "Light Pink" and the existing "Light Blue" both generate GEN-SHIR-LIG-M.
        token = self.token(productId=str(LIGHT_ID), variants=[_line(3, color="Light Pink", size="M")])

        detail = self.assert_commit_fails(token, 409, "VARIANT_ID_CONFLICT")
        self.assertEqual(detail["variantId"], "GEN-SHIR-LIG-M")


class IdempotencyTests(ReceivingCommitTestCase):
    # M. a repeated commit returns the original result and adds nothing
    def test_repeated_commit_does_not_add_stock_twice(self):
        token = self.token(productId=str(NIKE_ID), variants=EXAMPLE)
        first = self.commit(token)
        second = self.commit(token)

        self.assertTrue(second["replayed"])
        self.assertEqual({**second, "replayed": False}, first)
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-M"], 120)
        self.assertEqual(len(self.db.stock_movements.docs), 4)
        self.assertEqual(len(self.db.inventory_receivings.docs), 1)
        self.assertEqual(self.invalidated, ["store-a"])

    def test_concurrent_duplicate_commit_returns_original_result(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(0, "NK-TS-BLK-S")])
        first = self.commit(token)
        # Simulate a second request whose transaction started before the first
        # committed: it doesn't see the record, then hits the duplicate _id.
        real_find_one = self.db.inventory_receivings.find_one

        def find_one(query=None, projection=None, session=None):
            return None if session is not None else real_find_one(query, projection)

        with patch.object(self.db.inventory_receivings, "find_one", find_one, create=True):
            second = self.commit(token)

        self.assertTrue(second["replayed"])
        self.assertEqual(second["receivingId"], first["receivingId"])
        self.assertEqual(len(self.db.inventory_receivings.docs), 1)


class TokenSafetyTests(ReceivingCommitTestCase):
    def claims(self, token):
        return jwt.get_unverified_claims(token)

    def sign(self, claims, key=None):
        return jwt.encode(claims, key or inventory_receiving._preview_signing_key(), algorithm="HS256")

    # P. the browser cannot raise the committed amount
    def test_tampered_amount_is_rejected(self):
        token = self.token(productId=str(NIKE_ID), variants=[_line(20, "NK-TS-BLK-M")])
        header, _payload, signature = token.split(".")
        claims = self.claims(token)
        claims["lines"][0]["i"] = 2000
        forged_payload = jwt.encode(claims, "wrong-key", algorithm="HS256").split(".")[1]

        detail = self.assert_commit_fails(f"{header}.{forged_payload}.{signature}", 400, "INVALID_PREVIEW_TOKEN")
        self.assertIn("Refresh", detail["message"])
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-M"], 100)

    def test_commit_request_does_not_accept_amounts(self):
        for field in ("incomingStock", "finalStock", "variants"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                ReceivingCommitRequest(previewToken="x", **{field: 5})

    def test_expired_preview_is_rejected(self):
        preview = self.preview(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")])
        old, _ = inventory_receiving.sign_preview_token(
            "store-a", preview, now=datetime.now(timezone.utc) - timedelta(hours=2)
        )
        self.assert_commit_fails(old, 400, "RECEIVING_PREVIEW_EXPIRED")

    def test_login_token_or_plain_secret_is_not_a_preview_token(self):
        self.assert_commit_fails(create_token({"userId": "u-1", "role": "admin"}), 400, "INVALID_PREVIEW_TOKEN")
        claims = self.claims(self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")]))
        self.assert_commit_fails(self.sign(claims, key=SECRET_KEY), 400, "INVALID_PREVIEW_TOKEN")

    # F + Q. negative or decreasing amounts are rejected even inside a validly signed token
    def test_negative_amount_is_rejected_even_when_signed(self):
        claims = self.claims(self.token(productId=str(NIKE_ID), variants=[_line(5, "NK-TS-BLK-S")]))
        claims["lines"][0]["i"] = -5

        self.assert_commit_fails(self.sign(claims), 400, "INVALID_PREVIEW_TOKEN")
        self.assertEqual(self.db.stock(NIKE_ID)["NK-TS-BLK-S"], 20)

    def test_stock_never_decreases(self):
        before = self.db.stock(NIKE_ID)
        self.commit(self.token(productId=str(NIKE_ID), variants=[_line(0, "NK-TS-BLK-S"), _line(7, "NK-TS-BLK-M")]))
        after = self.db.stock(NIKE_ID)

        for variant_id, stock in before.items():
            self.assertGreaterEqual(after[variant_id], stock)
        for _name, _query, update in self.db.updates:
            self.assertTrue(all(value >= 0 for value in update.get("$inc", {}).values()))


class NewProductCommitTests(ReceivingCommitTestCase):
    def test_new_product_is_created_as_a_hidden_draft(self):
        result = self.commit(
            self.token(name="Linen Kurta", categoryId="T_SHIRTS", brand="Fab", variants=[
                _line(12, color="White", size="L"), _line(3, color="White", size="XL")])
        )

        self.assertEqual(result["action"], "PRODUCT_CREATED")
        product = self.db.product(ObjectId(result["productId"]))
        self.assertEqual((product["isDraft"], product["isActive"], product["price"], product["finalPrice"]),
                         (True, False, 0, 0))
        self.assertEqual((product["categoryId"], product["tenantId"]), ("T_SHIRTS", "store-a"))
        self.assertEqual(
            product["inventory"],
            [{"variantId": "FA-TSHI-WHI-L", "color": "White", "size": "L", "stock": 12},
             {"variantId": "FA-TSHI-WHI-XL", "color": "White", "size": "XL", "stock": 3}],
        )
        self.assertEqual((product["totalStock"], product["stock"]), (15, 15))
        self.assertEqual([doc["stockBefore"] for doc in self.db.stock_movements.docs], [0, 0])
        self.assertEqual(self.db.transactions, 1)

    def test_new_category_needs_confirmation_and_is_never_created(self):
        preview = self.preview(name="Linen Kurta", categoryId="KURTAS", variants=[_line(2, color="White", size="L")])
        self.assertTrue(preview["requiresConfirmation"])

        self.assert_commit_fails(preview["previewToken"], 409, "CONFIRMATION_REQUIRED")
        result = self.commit(preview["previewToken"], confirm=True)

        self.assertEqual(self.db.product(ObjectId(result["productId"]))["categoryId"], "KURTAS")
        self.assertNotIn("categories", self.db.collections)

    def test_same_product_created_after_preview_is_stale(self):
        token = self.token(name="Linen Kurta", categoryId="T_SHIRTS", variants=[_line(2, color="White", size="L")])
        self.db.products.docs.append(
            {"_id": ObjectId(), "tenantId": "store-a", "name": "linen kurta", "categoryId": "T_SHIRTS", "inventory": []}
        )

        detail = self.assert_commit_fails(token, 409, "RECEIVING_PREVIEW_STALE")
        self.assertEqual(detail["reason"], "product_created_after_preview")

    def test_duplicate_generated_ids_in_a_new_product_are_rejected(self):
        token = self.token(name="Linen Kurta", categoryId="T_SHIRTS", variants=[
            _line(1, color="Light Blue", size="M"), _line(1, color="Light Pink", size="M")])

        self.assert_commit_fails(token, 409, "VARIANT_ID_CONFLICT")

    def test_repeated_new_product_commit_creates_one_product(self):
        token = self.token(name="Linen Kurta", categoryId="T_SHIRTS", variants=[_line(2, color="White", size="L")])
        first = self.commit(token)
        second = self.commit(token)

        self.assertEqual(second["productId"], first["productId"])
        self.assertEqual(sum(doc.get("name") == "Linen Kurta" for doc in self.db.products.docs), 1)


class CommitRouteTests(unittest.TestCase):
    def test_commit_requires_inventory_permission(self):
        annotation = inspect.signature(inventory_routes.commit_receiving_stock).parameters["current_user"].annotation
        permission_check = annotation.__metadata__[0].dependency

        manager = {"role": "store_manager", "tenantId": "store-a", "permissions": {"read": True, "inventory": False}}
        with self.assertRaises(HTTPException) as error:
            permission_check(manager)
        self.assertEqual(error.exception.status_code, 403)
        manager["permissions"]["inventory"] = True
        self.assertIs(permission_check(manager), manager)


if __name__ == "__main__":
    unittest.main()
