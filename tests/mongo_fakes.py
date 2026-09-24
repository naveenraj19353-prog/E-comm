"""Small in-memory stand-in for a PyMongo Database, enough for the migration and
store export/import tests. Supports the query/update operators those modules
use; it is not a general Mongo emulator.
"""

from __future__ import annotations

import copy
import re
from types import SimpleNamespace

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

_MISSING = object()


def _get(doc, dotted):
    value = doc
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            return _MISSING
        value = value[part]
    return value


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _compare(value, op, operand):
    if value is _MISSING or value is None:
        return False
    if _is_number(value) and _is_number(operand):
        pass
    elif type(value) is not type(operand):
        return False
    return {
        "$gt": value > operand,
        "$gte": value >= operand,
        "$lt": value < operand,
        "$lte": value <= operand,
    }[op]


def _eq(value, expected):
    if expected is None:
        return value is _MISSING or value is None
    return value is not _MISSING and value == expected


def _match_condition(value, condition):
    if isinstance(condition, dict) and any(k.startswith("$") for k in condition):
        for op, operand in condition.items():
            if op == "$exists":
                if (value is not _MISSING) != bool(operand):
                    return False
            elif op == "$in":
                if not any(_eq(value, item) for item in operand):
                    return False
            elif op == "$ne":
                if _eq(value, operand):
                    return False
            elif op in {"$gt", "$gte", "$lt", "$lte"}:
                if not _compare(value, op, operand):
                    return False
            elif op == "$regex":
                flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
                if not isinstance(value, str) or not re.search(operand, value, flags):
                    return False
            elif op == "$options":
                continue
            else:
                raise NotImplementedError(op)
        return True
    return _eq(value, condition)


def matches(doc, query):
    for key, condition in (query or {}).items():
        if key == "$or":
            if not any(matches(doc, sub) for sub in condition):
                return False
        elif key == "$and":
            if not all(matches(doc, sub) for sub in condition):
                return False
        elif not _match_condition(_get(doc, key), condition):
            return False
    return True


def _project(doc, projection):
    doc = copy.deepcopy(doc)
    if not projection:
        return doc
    include = {k for k, v in projection.items() if v}
    if include:
        keep = include | ({"_id"} if projection.get("_id", 1) else set())
        return {k: v for k, v in doc.items() if k in keep}
    return {k: v for k, v in doc.items() if k not in projection}


def _sort_value(value):
    if value is _MISSING or value is None:
        return (0, 0)
    if _is_number(value):
        return (1, value)
    if isinstance(value, str):
        return (2, value)
    if isinstance(value, ObjectId):
        return (3, value.binary)
    return (4, str(value))


class FakeCursor:
    def __init__(self, docs, projection):
        self._docs = docs
        self._projection = projection
        self._limit = 0

    def sort(self, key, direction=1):
        keys = key if isinstance(key, list) else [(key, direction)]
        for field, dirn in reversed(keys):
            self._docs.sort(key=lambda d: _sort_value(_get(d, field)), reverse=dirn < 0)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def __iter__(self):
        docs = self._docs[: self._limit] if self._limit else self._docs
        return iter([_project(d, self._projection) for d in docs])


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.docs: list[dict] = []

    # reads
    def find(self, query=None, projection=None):
        return FakeCursor([d for d in self.docs if matches(d, query)], projection)

    def find_one(self, query=None, projection=None):
        for doc in self.docs:
            if matches(doc, query):
                return _project(doc, projection)
        return None

    def count_documents(self, query):
        return sum(1 for d in self.docs if matches(d, query))

    def distinct(self, key, query=None):
        values = []
        for doc in self.docs:
            if matches(doc, query):
                value = _get(doc, key)
                if value is not _MISSING and value not in values:
                    values.append(value)
        return values

    # writes
    def _ids(self):
        return {repr(d["_id"]) for d in self.docs}

    def insert_one(self, doc):
        doc = copy.deepcopy(doc)
        doc.setdefault("_id", ObjectId())
        if repr(doc["_id"]) in self._ids():
            raise DuplicateKeyError(f"duplicate _id {doc['_id']!r}")
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc["_id"])

    def insert_many(self, docs, ordered=True):
        ids = [self.insert_one(d).inserted_id for d in docs]
        return SimpleNamespace(inserted_ids=ids)

    def _apply(self, doc, update, inserting):
        for op, fields in update.items():
            for key, value in fields.items():
                if op == "$set":
                    doc[key] = copy.deepcopy(value)
                elif op == "$setOnInsert":
                    if inserting:
                        doc[key] = copy.deepcopy(value)
                elif op == "$unset":
                    doc.pop(key, None)
                elif op == "$inc":
                    doc[key] = doc.get(key, 0) + value
                elif op == "$max":
                    if key not in doc or doc[key] < value:
                        doc[key] = value
                else:
                    raise NotImplementedError(op)

    def _upsert_doc(self, query, update):
        doc = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
        self._apply(doc, update, inserting=True)
        self.insert_one(doc)
        return doc

    def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if matches(doc, query):
                before = copy.deepcopy(doc)
                self._apply(doc, update, inserting=False)
                return SimpleNamespace(
                    matched_count=1, modified_count=int(before != doc), upserted_id=None
                )
        if upsert:
            doc = self._upsert_doc(query, update)
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=doc["_id"])
        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)

    def find_one_and_update(self, query, update, upsert=False, return_document=ReturnDocument.BEFORE, projection=None):
        for doc in self.docs:
            if matches(doc, query):
                before = copy.deepcopy(doc)
                self._apply(doc, update, inserting=False)
                return _project(doc if return_document == ReturnDocument.AFTER else before, projection)
        if upsert:
            doc = self._upsert_doc(query, update)
            return _project(doc, projection) if return_document == ReturnDocument.AFTER else None
        return None

    def delete_one(self, query):
        for index, doc in enumerate(self.docs):
            if matches(doc, query):
                del self.docs[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))


class FakeDatabase:
    def __init__(self, name="fake_db"):
        self.name = name
        self._collections: dict[str, FakeCollection] = {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = FakeCollection(name)
        return self._collections[name]

    def list_collection_names(self):
        return [name for name, coll in self._collections.items() if coll.docs]
