"""Read-only inventory audit (see docs/inventory-analysis.md).

Reports, without writing anything:

* products whose stored `stock` / `totalStock` differ from sum(inventory[].stock),
  with a reconciliation against order quantities;
* variantIds shared by more than one product in a store (allowed: variantId only
  has to be unique within a product), and how many products would fail the
  `PUT /product/{id}` inventory validation if saved unchanged;
* stock movement history counts, checkout stock holds, and order/cart lines
  that point at variants that no longer exist.

Only find / aggregate / count queries are used. Run from the repo root:

    venv\\Scripts\\python.exe scripts\\audit_inventory.py            # Windows
    venv/bin/python scripts/audit_inventory.py                      # Linux
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app.database.mongo import client, db  # noqa: E402
from app.routes.product import validate_inventory  # noqa: E402
from app.services.variant_sku import assign_variant_ids_for_inventory  # noqa: E402

CLOSED_ORDER_STATUSES = {"cancelled", "delivered", "returned", "closed"}


def as_int(value) -> int | None:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return None


def inventory_sum(product: dict) -> int:
    return sum(as_int(item.get("stock")) or 0 for item in product.get("inventory") or [] if isinstance(item, dict))


def section(title: str) -> None:
    print(f"\n== {title}")


def audit_cluster() -> None:
    section("Cluster")
    hello = client.admin.command("hello")
    print("replica set:", hello.get("setName"), "| multi-document transactions possible:", bool(hello.get("setName")))


def audit_products(products) -> tuple[list[dict], dict]:
    section("Stored stock / totalStock vs sum(inventory)")
    docs = list(products.find({}, {"tenantId": 1, "name": 1, "brand": 1, "categoryName": 1,
                                   "categoryId": 1, "inventory": 1, "stock": 1, "totalStock": 1}))
    mismatched = []
    owners: dict[tuple, set] = defaultdict(set)
    for product in docs:
        total = inventory_sum(product)
        stale_stock = "stock" in product and as_int(product.get("stock")) != total
        stale_total = "totalStock" in product and as_int(product.get("totalStock")) != total
        if stale_stock or stale_total:
            mismatched.append(product)
        for item in product.get("inventory") or []:
            variant_id = str((item or {}).get("variantId") or "")
            if variant_id:
                owners[(product.get("tenantId"), variant_id)].add(str(product["_id"]))
    print(f"products: {len(docs)} | with stale stock or totalStock: {len(mismatched)}")
    return mismatched, owners


def reconcile(products, orders, payment_intents, mismatched: list[dict]) -> None:
    section("Reconciliation: create-time `stock` - units in non-cancelled orders - held units")
    held: dict[str, int] = defaultdict(int)
    for intent in payment_intents.find({"status": "pending", "stockReserved": True}, {"reservedItems": 1}):
        for item in intent.get("reservedItems") or []:
            held[str(item.get("productId"))] += int(item.get("quantity") or 0)

    for product in mismatched:
        product_id = str(product["_id"])
        units_by_status: dict[str, int] = defaultdict(int)
        for order in orders.find({"items.productId": product["_id"]}, {"items": 1, "orderStatus": 1}):
            for line in order.get("items") or []:
                if str(line.get("productId")) == product_id:
                    units_by_status[order.get("orderStatus")] += int(line.get("quantity") or 0)
        sold = sum(qty for status, qty in units_by_status.items() if status != "cancelled")
        total = inventory_sum(product)
        stored = product.get("stock")
        if stored is None:
            verdict = "no stored `stock` to reconcile against"
        else:
            expected = as_int(stored) - sold - held[product_id]
            verdict = ("explained by orders" if expected == total
                       else f"NOT explained by orders (diff {total - expected:+d}); needs a physical count")
        print(f"- [{product.get('tenantId')}] {str(product.get('name'))[:60]!r}")
        print(f"    stock={stored} totalStock={product.get('totalStock')} inventory sum={total} "
              f"| order units by status={dict(units_by_status)} held={held[product_id]} -> {verdict}")


def audit_variant_ids(products, owners: dict) -> None:
    section("variantIds shared by more than one product in the same store (allowed)")
    shared = {key: ids for key, ids in owners.items() if len(ids) > 1}
    for (tenant_id, variant_id), ids in sorted(shared.items(), key=lambda row: -len(row[1])):
        print(f"  store={tenant_id} variantId={variant_id} products={len(ids)}")
    if not shared:
        print("  none")

    section("Dry run of the PUT /product/{id} inventory validation (same code the endpoint runs)")
    ok = blocked = 0
    for product in products.find({}, {"tenantId": 1, "brand": 1, "categoryName": 1, "categoryId": 1, "inventory": 1}):
        prepared = assign_variant_ids_for_inventory(
            {"brand": product.get("brand"), "categoryName": product.get("categoryName"),
             "categoryId": product.get("categoryId")},
            [dict(item) for item in product.get("inventory") or []],
            existing_inventory=product.get("inventory") or [],
        )
        try:
            validate_inventory(prepared)
            ok += 1
        except HTTPException as error:
            blocked += 1
            print(f"  would fail: [{product.get('tenantId')}] {product['_id']}: {error.detail}")
    print(f"saving a product unchanged would succeed: {ok} | fail validation: {blocked}")


def audit_history_and_holds(db_, owners: dict) -> None:
    section("Stock movement history")
    movements = db_["stock_movements"]
    print("rows:", movements.count_documents({}))
    for row in movements.aggregate([{"$group": {"_id": "$source", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}]):
        print(f"  {row['_id']}: {row['n']}")

    section("Checkout stock holds (payment_intents)")
    intents = db_["payment_intents"]
    print("status counts:", {row["_id"]: row["n"] for row in intents.aggregate(
        [{"$group": {"_id": "$status", "n": {"$sum": 1}}}])})
    print("pending with stock held:", intents.count_documents({"status": "pending", "stockReserved": True}))
    for intent in intents.find({"status": "expired", "stockReserved": True},
                               {"tenantId": 1, "razorpayOrderId": 1, "expiredAt": 1}):
        has_order = db_["orders"].count_documents({"razorpayOrderId": intent.get("razorpayOrderId")}) > 0
        print(f"  expired hold store={intent.get('tenantId')} razorpayOrderId={intent.get('razorpayOrderId')} "
              f"orderExists={has_order} (if it was paid later, check Razorpay for a charge without an order)")

    section("Lines pointing at variants that no longer exist")
    live = {(product_id, variant_id) for (_tenant, variant_id), ids in owners.items() for product_id in ids}
    missing_order_lines = missing_open = 0
    for order in db_["orders"].find({}, {"items.productId": 1, "items.variantId": 1, "orderStatus": 1}):
        for line in order.get("items") or []:
            if (str(line.get("productId")), str(line.get("variantId"))) not in live:
                missing_order_lines += 1
                missing_open += order.get("orderStatus") not in CLOSED_ORDER_STATUSES
    missing_cart_lines = sum(
        1 for cart in db_["carts"].find({}, {"productId": 1, "variantId": 1})
        if (str(cart.get("productId")), str(cart.get("variantId"))) not in live
    )
    print(f"order lines: {missing_order_lines} (on open orders: {missing_open}) | cart lines: {missing_cart_lines}")


def main() -> None:
    products = db["products"]
    audit_cluster()
    mismatched, owners = audit_products(products)
    reconcile(products, db["orders"], db["payment_intents"], mismatched)
    audit_variant_ids(products, owners)
    audit_history_and_holds(db, owners)


if __name__ == "__main__":
    main()
