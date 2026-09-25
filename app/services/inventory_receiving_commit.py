"""Receiving-stock commit: applies a signed receiving preview in ONE MongoDB
transaction, so a receiving is either fully applied or not applied at all.

Inside the transaction:
  1. receivingId already committed? -> return the stored result (idempotent;
     a double click or retry never adds stock twice)
  2. re-read the product (tenant-scoped); gone -> 409 stale
  3. existing variants: `$inc` only while the variant still has the previewed
     variantId, color, size and stock (compare-and-increment in one update);
     anything changed -> 409 RECEIVING_PREVIEW_STALE
  4. new variants: re-check the color/size still doesn't exist, finalize the
     variantId with the normal generator (a clash -> 409 VARIANT_ID_CONFLICT)
     and `$push` the rows. The inventory array is never replaced.
     A new product is inserted as a draft (price 0, not purchasable).
  5. recompute totalStock, write the "receiving" stock movements and the
     receiving record

Amounts come only from the signed preview token, never from the request body.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from app.database.mongo import client, inventory_receivings, products, stock_movements
from app.models.inventory_receiving import ReceivingTokenClaims, ReceivingTokenLine
from app.services.cache import invalidate_tenant
from app.services.inventory_receiving import (
    ADD_TO_EXISTING_VARIANT,
    INVALID_PREVIEW_TOKEN,
    _stock_of,
)
from app.services.product_duplicates import categories_match, normalize_product_label
from app.services.stock_movements import build_movement
from app.services.variant_sku import _variant_key_for_lookup, generate_variant_sku

RECEIVING_PREVIEW_STALE = "RECEIVING_PREVIEW_STALE"
VARIANT_ID_CONFLICT = "VARIANT_ID_CONFLICT"
CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
RECEIVING_IN_PROGRESS = "RECEIVING_IN_PROGRESS"
STALE_MESSAGE = "Stock changed after preview. Refresh the preview before saving."
DEFAULT_NOTE = "Admin stock receiving"

STOCK_INCREASED = "STOCK_INCREASED"
VARIANT_CREATED = "VARIANT_CREATED"
UNCHANGED = "UNCHANGED"

_PRODUCT_FIELDS = {"name": 1, "brand": 1, "categoryId": 1, "categoryName": 1, "inventory": 1}


def _stale(reason: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={"code": RECEIVING_PREVIEW_STALE, "message": STALE_MESSAGE, "reason": reason},
    )


def _confirmation_required() -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": CONFIRMATION_REQUIRED,
            "message": "Confirm this receiving (for example its new category) before saving.",
        },
    )


def _variant_id_conflict(variant_id: str, line: ReceivingTokenLine) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": VARIANT_ID_CONFLICT,
            "message": (
                f"The generated variantId {variant_id} for {line.c} / {line.s} is already used "
                "by another variant of this product."
            ),
            "variantId": variant_id,
        },
    )


def _row(variant_id: str, line: ReceivingTokenLine, before: int, action: str) -> dict:
    return {
        "variantId": variant_id,
        "color": line.c,
        "size": line.s,
        "beforeStock": before,
        "receivedStock": line.i,
        "afterStock": before + line.i,
        "action": action,
    }


def _generated_variant_id(sku_source: dict, line: ReceivingTokenLine) -> str:
    # Same inputs as assign_variant_ids_for_inventory on product create/update.
    return generate_variant_sku(
        sku_source.get("brand"),
        sku_source.get("categoryName") or sku_source.get("categoryId"),
        line.c,
        line.s,
    )


def _finalize_new_variant_id(sku_source: dict, line: ReceivingTokenLine, taken: set[str]) -> str:
    variant_id = _generated_variant_id(sku_source, line)
    if variant_id != line.p:
        # The product's brand/category changed since the preview.
        raise _stale("variant_id_changed")
    if variant_id in taken:
        raise _variant_id_conflict(variant_id, line)
    taken.add(variant_id)
    return variant_id


def _receive_into_existing_product(claims: ReceivingTokenClaims, now: datetime, session) -> tuple[dict, list[dict]]:
    if not ObjectId.is_valid(claims.pid):
        raise HTTPException(status_code=400, detail={"code": INVALID_PREVIEW_TOKEN, "message": "Invalid preview."})
    scope = {"_id": ObjectId(claims.pid), "tenantId": claims.tid}
    product = products.find_one(scope, _PRODUCT_FIELDS, session=session)
    if not product:
        raise _stale("product_missing")

    inventory = [item for item in product.get("inventory") or [] if isinstance(item, dict)]
    by_id = {str(item.get("variantId")): item for item in inventory if item.get("variantId")}
    by_key = {_variant_key_for_lookup(item) for item in inventory}
    taken = set(by_id)
    rows: list[dict] = []
    new_items: list[dict] = []

    for line in claims.lines:
        if line.a == ADD_TO_EXISTING_VARIANT:
            item = by_id.get(line.v)
            if item is None or item.get("color") != line.c or item.get("size") != line.s:
                raise _stale("variant_changed")
            if _stock_of(item) != line.e:
                raise _stale("stock_changed")
            if line.i:
                # Compare-and-increment: only matches while the variant still has the
                # previewed stock, so a concurrent change can never be overwritten.
                result = products.update_one(
                    {
                        **scope,
                        "inventory": {
                            "$elemMatch": {"variantId": line.v, "color": line.c, "size": line.s, "stock": line.e}
                        },
                    },
                    {"$inc": {"inventory.$.stock": line.i}},
                    session=session,
                )
                if result.matched_count != 1:
                    raise _stale("stock_changed")
            rows.append(_row(line.v, line, line.e, STOCK_INCREASED if line.i else UNCHANGED))
        else:
            if _variant_key_for_lookup({"color": line.c, "size": line.s}) in by_key:
                raise _stale("variant_created_after_preview")
            variant_id = _finalize_new_variant_id(product, line, taken)
            new_items.append({"variantId": variant_id, "color": line.c, "size": line.s, "stock": line.i})
            rows.append(_row(variant_id, line, 0, VARIANT_CREATED))

    if new_items:
        result = products.update_one(
            {**scope, "inventory.variantId": {"$nin": [item["variantId"] for item in new_items]}},
            {"$push": {"inventory": {"$each": new_items}}},
            session=session,
        )
        if result.matched_count != 1:
            raise _stale("variant_created_after_preview")

    updated = products.find_one(scope, _PRODUCT_FIELDS, session=session)
    total = sum(_stock_of(item) for item in updated.get("inventory") or [] if isinstance(item, dict))
    products.update_one(scope, {"$set": {"totalStock": total, "updatedAt": now}}, session=session)
    return updated, rows


def _category_in_use(tenant_id: str, category_id: str, category_name: str, session) -> bool:
    for product in products.find({"tenantId": tenant_id}, {"categoryId": 1, "categoryName": 1}, session=session):
        if categories_match(product, category_id, category_name):
            return True
    return False


def _same_product_exists(tenant_id: str, name: str, category_id: str, category_name: str, session) -> bool:
    """find_duplicate_product's rule (exact normalized name + category), read in the transaction."""
    wanted = normalize_product_label(name)
    for product in products.find(
        {"tenantId": tenant_id, "name": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}},
        {"name": 1, "categoryId": 1, "categoryName": 1},
        session=session,
    ):
        if normalize_product_label(product.get("name")) == wanted and categories_match(
            product, category_id, category_name
        ):
            return True
    return False


def _create_draft_product(
    claims: ReceivingTokenClaims, now: datetime, confirm: bool, session
) -> tuple[dict, list[dict]]:
    new = claims.new
    # The category is never created; if no product uses it any more, it needs confirming.
    if not confirm and not _category_in_use(claims.tid, new.categoryId, new.categoryName, session):
        raise _confirmation_required()
    if _same_product_exists(claims.tid, new.name, new.categoryId, new.categoryName, session):
        raise _stale("product_created_after_preview")

    sku_source = {"brand": new.brand, "categoryId": new.categoryId, "categoryName": new.categoryName}
    taken: set[str] = set()
    inventory: list[dict] = []
    rows: list[dict] = []
    for line in claims.lines:
        variant_id = _finalize_new_variant_id(sku_source, line, taken)
        inventory.append({"variantId": variant_id, "color": line.c, "size": line.s, "stock": line.i})
        rows.append(_row(variant_id, line, 0, VARIANT_CREATED))

    total = sum(item["stock"] for item in inventory)
    payload = {
        "tenantId": claims.tid,
        "name": new.name,
        "description": "",
        "categoryId": new.categoryId,
        "categoryName": new.categoryName,
        "brand": new.brand,
        "location": None,
        "foodType": None,
        # Receiving has no price: saved as a hidden draft so it can never be
        # bought at 0; the admin sets the price and publishes it later.
        "price": 0,
        "discountPercentage": 0,
        "finalPrice": 0,
        "inventory": inventory,
        "totalStock": total,
        "stock": total,
        "images": {},
        "isActive": False,
        "isDraft": True,
        "createdAt": now,
        "updatedAt": now,
        "averageRating": 0,
        "reviewCount": 0,
    }
    payload["_id"] = products.insert_one(payload, session=session).inserted_id
    return payload, rows


def _replay(record: dict, tenant_id: str) -> dict:
    if record.get("tenantId") != tenant_id:
        raise HTTPException(status_code=400, detail={"code": INVALID_PREVIEW_TOKEN, "message": "Invalid preview."})
    return {**record["result"], "replayed": True}


def _created_by(user: dict) -> dict:
    return {
        "userId": str(user.get("userId") or "") or None,
        "name": user.get("name") or user.get("email"),
        "role": user.get("role"),
    }


def commit_receiving(
    claims: ReceivingTokenClaims,
    *,
    tenant_id: str,
    user: dict,
    confirm: bool = False,
    note: str | None = None,
) -> dict:
    if claims.tid != tenant_id:
        raise HTTPException(status_code=403, detail="You cannot access another tenant.")
    if claims.conf and not confirm:
        raise _confirmation_required()
    note = (note or "").strip() or DEFAULT_NOTE

    def apply(session) -> dict:
        record = inventory_receivings.find_one({"_id": claims.rid}, session=session)
        if record:
            return _replay(record, tenant_id)

        now = datetime.now(timezone.utc)
        if claims.act == "EXISTING_PRODUCT":
            product, rows = _receive_into_existing_product(claims, now, session)
            action = "EXISTING_PRODUCT"
        else:
            product, rows = _create_draft_product(claims, now, confirm, session)
            action = "PRODUCT_CREATED"

        movements = [
            build_movement(
                tenant_id=tenant_id,
                product=product,
                variant_id=row["variantId"],
                change=row["receivedStock"],
                source="receiving",
                stock_after=row["afterStock"],
                stock_before=row["beforeStock"],
                reference_id=claims.rid,
                note=note,
                user=user,
                now=now,
            )
            for row in rows
            if row["receivedStock"] > 0
        ]
        if movements:
            stock_movements.insert_many(movements, session=session)

        result = {
            "success": True,
            "receivingId": claims.rid,
            "productId": str(product["_id"]),
            "action": action,
            "variants": rows,
            "totals": {
                key: sum(row[key] for row in rows) for key in ("beforeStock", "receivedStock", "afterStock")
            },
        }
        inventory_receivings.insert_one(
            {
                "_id": claims.rid,
                "tenantId": tenant_id,
                "productId": product["_id"],
                "action": action,
                "note": note,
                "createdBy": _created_by(user),
                "createdAt": now,
                "result": result,
            },
            session=session,
        )
        return {**result, "replayed": False}

    try:
        with client.start_session() as session:
            result = session.with_transaction(
                apply,
                read_concern=ReadConcern("snapshot"),
                write_concern=WriteConcern("majority"),
            )
    except DuplicateKeyError:
        # Another request committed this receivingId first.
        record = inventory_receivings.find_one({"_id": claims.rid})
        if not record:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": RECEIVING_IN_PROGRESS,
                    "message": "This receiving is already being saved. Refresh in a moment.",
                },
            )
        return _replay(record, tenant_id)

    if not result["replayed"]:
        invalidate_tenant(tenant_id)
    return result
