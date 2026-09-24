"""Human-readable order references: RC-10001, RC-10002, ...

`orderNumber` is the per-store sequential integer stored on each order (see
order_fulfillment.next_order_number); this is how it's shown to customers and
admins. Orders created before numbering existed fall back to the last eight
characters of their database id until the backfill migration numbers them.
"""

ORDER_REF_PREFIX = "RC-"
ORDER_REF_OFFSET = 10000


def format_order_ref(order_number) -> str | None:
    if isinstance(order_number, bool) or not isinstance(order_number, int) or order_number <= 0:
        return None
    return f"{ORDER_REF_PREFIX}{ORDER_REF_OFFSET + order_number}"


def order_ref(order: dict) -> str:
    ref = format_order_ref(order.get("orderNumber"))
    if ref:
        return ref
    raw = str(order.get("_id") or "")[-8:].upper()
    return "".join(character for character in raw if character.isalnum())
