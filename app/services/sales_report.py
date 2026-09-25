"""Store sales dashboard numbers (REQ-101, REQ-102, REQ-103, REQ-104, REQ-105).

Definitions (shown to merchants on the dashboard):
- Orders: orders placed in the range, cancelled ones excluded.
- Net sales: order totals minus refunds, cancelled orders excluded.
- Average order value (AOV): net sales / orders.
- Top products: by units sold in non-cancelled orders.

All grouping uses the admin's local time zone (tzOffset minutes east of UTC),
so "today" means today in India.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

MAX_RANGE_DAYS = 400
GROUP_UNITS = {"day", "week", "month"}
TOP_PRODUCTS_LIMIT = 10
EXCLUDED_STATUSES = ["cancelled"]


class ReportRangeError(ValueError):
    """Bad dates / grouping; the route turns it into a 400."""


def tz_string(offset_minutes: int) -> str:
    """330 -> '+05:30' (MongoDB $dateTrunc / $dateToString timezone)."""
    if abs(offset_minutes) > 14 * 60:
        raise ReportRangeError("Invalid time zone offset.")
    sign = "+" if offset_minutes >= 0 else "-"
    minutes = abs(offset_minutes)
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


def resolve_range(
    date_from: str | None,
    date_to: str | None,
    tz_offset_minutes: int,
    today: date | None = None,
) -> tuple[datetime, datetime, date, date]:
    """Inclusive local-day range -> (start_utc, end_utc_exclusive, first_day, last_day).

    Defaults to the last 30 days including today.
    """
    local = timezone(timedelta(minutes=tz_offset_minutes))
    today = today or datetime.now(local).date()
    try:
        last = date.fromisoformat(date_to) if date_to else today
        first = date.fromisoformat(date_from) if date_from else last - timedelta(days=29)
    except ValueError as error:
        raise ReportRangeError("Dates must look like 2026-09-24.") from error
    if first > last:
        raise ReportRangeError("'from' must be on or before 'to'.")
    if (last - first).days + 1 > MAX_RANGE_DAYS:
        raise ReportRangeError(f"Pick a range of at most {MAX_RANGE_DAYS} days.")
    start = datetime.combine(first, time.min, tzinfo=local).astimezone(timezone.utc)
    end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=local).astimezone(timezone.utc)
    return start, end, first, last


def default_group(first: date, last: date) -> str:
    days = (last - first).days + 1
    if days <= 45:
        return "day"
    if days <= 180:
        return "week"
    return "month"


def _net_amount() -> dict:
    return {
        "$subtract": [
            {"$ifNull": ["$totalAmount", 0]},
            {"$ifNull": ["$refundedAmount", 0]},
        ]
    }


def summary_pipeline(tenant_id: str, start: datetime, end: datetime) -> list[dict]:
    return [
        {"$match": {"tenantId": tenant_id, "createdAt": {"$gte": start, "$lt": end}}},
        {
            "$group": {
                "_id": None,
                "placed": {"$sum": 1},
                "cancelled": {
                    "$sum": {"$cond": [{"$in": ["$orderStatus", EXCLUDED_STATUSES]}, 1, 0]}
                },
                "netSales": {
                    "$sum": {
                        "$cond": [{"$in": ["$orderStatus", EXCLUDED_STATUSES]}, 0, _net_amount()]
                    }
                },
                "refunded": {"$sum": {"$ifNull": ["$refundedAmount", 0]}},
            }
        },
    ]


def series_pipeline(tenant_id: str, start: datetime, end: datetime, unit: str, tz: str) -> list[dict]:
    return [
        {
            "$match": {
                "tenantId": tenant_id,
                "createdAt": {"$gte": start, "$lt": end},
                "orderStatus": {"$nin": EXCLUDED_STATUSES},
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": {
                            "$dateTrunc": {
                                "date": "$createdAt",
                                "unit": unit,
                                "timezone": tz,
                                **({"startOfWeek": "monday"} if unit == "week" else {}),
                            }
                        },
                        "timezone": tz,
                    }
                },
                "orders": {"$sum": 1},
                "netSales": {"$sum": _net_amount()},
            }
        },
        {"$sort": {"_id": 1}},
    ]


def status_pipeline(tenant_id: str, start: datetime, end: datetime) -> list[dict]:
    return [
        {"$match": {"tenantId": tenant_id, "createdAt": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": {"$ifNull": ["$orderStatus", "confirmed"]}, "count": {"$sum": 1}}},
    ]


def top_products_pipeline(tenant_id: str, start: datetime, end: datetime) -> list[dict]:
    return [
        {
            "$match": {
                "tenantId": tenant_id,
                "createdAt": {"$gte": start, "$lt": end},
                "orderStatus": {"$nin": EXCLUDED_STATUSES},
            }
        },
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": {"$toString": "$items.productId"},
                "name": {"$last": "$items.name"},
                "units": {"$sum": {"$ifNull": ["$items.quantity", 0]}},
                "sales": {"$sum": {"$ifNull": ["$items.subtotal", 0]}},
            }
        },
        {"$sort": {"units": -1, "sales": -1}},
        {"$limit": TOP_PRODUCTS_LIMIT},
    ]


def period_keys(first: date, last: date, unit: str) -> list[str]:
    """Every bucket in the range, so days/weeks with no orders show as 0."""
    keys: list[str] = []
    if unit == "day":
        current = first
        while current <= last:
            keys.append(current.isoformat())
            current += timedelta(days=1)
    elif unit == "week":
        current = first - timedelta(days=first.weekday())  # Monday
        while current <= last:
            keys.append(current.isoformat())
            current += timedelta(days=7)
    else:
        current = first.replace(day=1)
        while current <= last:
            keys.append(current.isoformat())
            current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
    return keys


def build_report(
    *,
    summary_rows: list[dict],
    series_rows: list[dict],
    status_rows: list[dict],
    top_rows: list[dict],
    first: date,
    last: date,
    unit: str,
) -> dict:
    summary = summary_rows[0] if summary_rows else {}
    placed = int(summary.get("placed") or 0)
    cancelled = int(summary.get("cancelled") or 0)
    orders_count = placed - cancelled
    net_sales = round(float(summary.get("netSales") or 0), 2)
    by_period = {row["_id"]: row for row in series_rows}
    series = [
        {
            "period": key,
            "orders": int((by_period.get(key) or {}).get("orders") or 0),
            "netSales": round(float((by_period.get(key) or {}).get("netSales") or 0), 2),
        }
        for key in period_keys(first, last, unit)
    ]
    status_counts = {str(row["_id"]): int(row.get("count") or 0) for row in status_rows}
    return {
        "from": first.isoformat(),
        "to": last.isoformat(),
        "groupBy": unit,
        "totals": {
            "orders": orders_count,
            "ordersPlaced": placed,
            "cancelled": cancelled,
            "netSales": net_sales,
            "refunded": round(float(summary.get("refunded") or 0), 2),
            "averageOrderValue": round(net_sales / orders_count, 2) if orders_count else 0.0,
        },
        "series": series,
        "statusCounts": status_counts,
        "topProducts": [
            {
                "productId": row["_id"],
                "name": row.get("name") or "Product",
                "units": int(row.get("units") or 0),
                "sales": round(float(row.get("sales") or 0), 2),
            }
            for row in top_rows
        ],
    }
