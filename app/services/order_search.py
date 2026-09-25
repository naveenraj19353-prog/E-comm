"""Search and date filters for the admin order list (REQ-039).

`build_order_filters` turns the admin's search text and date range into a
MongoDB filter for the `orders` collection. It is kept separate from the
route so it can be unit-tested without a database: the customer lookup is
passed in as `find_customer_ids`.

Search matches, in one box:
- order reference: "RC-10023", "10023" or the order's database id
- customer name / email / phone on the account
- name / phone on the delivery address snapshot
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from datetime import date, datetime, time, timedelta, timezone

from bson import ObjectId

from app.utils.order_ref import ORDER_REF_OFFSET, ORDER_REF_PREFIX

MAX_SEARCH_LENGTH = 100

_REF_RE = re.compile(rf"^(?:{re.escape(ORDER_REF_PREFIX)})?\s*(\d{{1,12}})$", re.IGNORECASE)


class InvalidOrderFilter(ValueError):
    """Raised for a malformed date range; the route turns it into a 400."""


def parse_order_number(text: str) -> int | None:
    """Turn RC-10023 or 10023 into orderNumber 23; small numbers are taken as-is."""
    match = _REF_RE.match(text.strip())
    if not match:
        return None
    value = int(match.group(1))
    if value > ORDER_REF_OFFSET:
        return value - ORDER_REF_OFFSET
    return value if value > 0 else None


def _parse_day(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError as error:
        raise InvalidOrderFilter(f"{field} must be a date like 2026-09-24.") from error


MAX_TZ_OFFSET_MINUTES = 14 * 60


def date_range_filter(
    date_from: str | None,
    date_to: str | None,
    tz_offset_minutes: int = 0,
) -> dict | None:
    """Inclusive day range on createdAt.

    Days are the admin's local days: `tz_offset_minutes` is minutes east of
    UTC (India = 330), so "2026-09-24" means 24 Sep 00:00 to 25 Sep 00:00 IST.
    """
    start = _parse_day(date_from, "from")
    end = _parse_day(date_to, "to")
    if start and end and start > end:
        raise InvalidOrderFilter("'from' date must be on or before 'to' date.")
    if abs(tz_offset_minutes) > MAX_TZ_OFFSET_MINUTES:
        raise InvalidOrderFilter("Invalid time zone offset.")
    local = timezone(timedelta(minutes=tz_offset_minutes))
    condition: dict = {}
    if start:
        condition["$gte"] = datetime.combine(start, time.min, tzinfo=local).astimezone(timezone.utc)
    if end:
        condition["$lt"] = datetime.combine(end + timedelta(days=1), time.min, tzinfo=local).astimezone(timezone.utc)
    return condition or None


def _user_id_values(user_ids: Iterable) -> list:
    """Orders may store userId as an ObjectId or as its string; match both."""
    values: list = []
    for user_id in user_ids:
        text = str(user_id)
        values.append(text)
        if ObjectId.is_valid(text):
            values.append(ObjectId(text))
    return values


def search_filter(
    search: str | None,
    tenant_id: str,
    find_customer_ids: Callable[[str, str], Iterable],
) -> dict | None:
    text = (search or "").strip()[:MAX_SEARCH_LENGTH]
    if not text:
        return None
    pattern = {"$regex": re.escape(text), "$options": "i"}
    clauses: list[dict] = [
        {"address.fullName": pattern},
        {"address.phone": pattern},
    ]
    order_number = parse_order_number(text)
    if order_number is not None:
        clauses.append({"orderNumber": order_number})
    if ObjectId.is_valid(text):
        clauses.append({"_id": ObjectId(text)})
    customer_ids = list(find_customer_ids(tenant_id, text))
    if customer_ids:
        clauses.append({"userId": {"$in": _user_id_values(customer_ids)}})
    return {"$or": clauses}


def build_order_filters(
    tenant_id: str,
    search: str | None,
    date_from: str | None,
    date_to: str | None,
    find_customer_ids: Callable[[str, str], Iterable],
    tz_offset_minutes: int = 0,
) -> dict:
    """Extra conditions to AND with {"tenantId": ...}. Empty dict = no filter."""
    conditions: dict = {}
    created = date_range_filter(date_from, date_to, tz_offset_minutes)
    if created:
        conditions["createdAt"] = created
    matched = search_filter(search, tenant_id, find_customer_ids)
    if matched:
        conditions.update(matched)
    return conditions
