"""Order count, spend and last order date per customer (REQ-063).

Used by the admin customer list. Spend = order total minus refunds, over
orders that were not cancelled. Orders store userId as a string or an
ObjectId depending on how they were created, so both forms are matched.
"""

from __future__ import annotations

from collections.abc import Iterable

from bson import ObjectId

EXCLUDED_STATUSES = ["cancelled"]


def user_id_values(user_ids: Iterable) -> list:
    values: list = []
    for user_id in user_ids:
        text = str(user_id)
        values.append(text)
        if ObjectId.is_valid(text):
            values.append(ObjectId(text))
    return values


def order_stats_pipeline(tenant_id: str, user_ids: Iterable) -> list[dict]:
    return [
        {
            "$match": {
                "tenantId": tenant_id,
                "userId": {"$in": user_id_values(user_ids)},
                "orderStatus": {"$nin": EXCLUDED_STATUSES},
            }
        },
        {
            "$group": {
                "_id": {"$toString": "$userId"},
                "orderCount": {"$sum": 1},
                "totalSpent": {
                    "$sum": {
                        "$subtract": [
                            {"$ifNull": ["$totalAmount", 0]},
                            {"$ifNull": ["$refundedAmount", 0]},
                        ]
                    }
                },
                "lastOrderAt": {"$max": "$createdAt"},
            }
        },
    ]


def empty_stats() -> dict:
    return {"orderCount": 0, "totalSpent": 0.0, "lastOrderAt": None}


def stats_by_user(rows: Iterable[dict]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for row in rows:
        last = row.get("lastOrderAt")
        result[str(row["_id"])] = {
            "orderCount": int(row.get("orderCount") or 0),
            "totalSpent": round(float(row.get("totalSpent") or 0), 2),
            "lastOrderAt": last.isoformat() if hasattr(last, "isoformat") else last,
        }
    return result
