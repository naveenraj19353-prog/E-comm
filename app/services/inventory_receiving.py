"""Receiving-stock preview: existing stock + incoming stock = final stock.

READ + CALCULATE ONLY. Nothing here writes to any collection or cache; the
only database calls are `products.find` / `products.find_one`.

The preview is a snapshot. It returns a signed, stateless `previewToken`
(nothing is stored) holding exactly what was previewed; the commit
(`inventory_receiving_commit.py`) re-reads the product, applies the incoming
quantities atomically (`$inc`) and never trusts `finalStock` from the
browser. `proposedVariantId` is display-only; the commit re-validates it.

Product match priority:
  1. explicit productId (same tenant only)
  2. a variantId that exactly one product in the tenant uses
     (a variantId shared by several products is never guessed: 409)
  3. exact normalized name + category -> "candidate", requires confirmation
  4. otherwise a new product

Variant match priority (within the matched product):
  1. exact variantId  2. normalized color + size  3. new variant
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException
from jose import ExpiredSignatureError, JWTError, jwt
from pydantic import ValidationError

from app.config import SECRET_KEY
from app.database.mongo import products
from app.models.inventory_receiving import (
    ReceivingPreviewRequest,
    ReceivingTokenClaims,
    ReceivingVariantInput,
)
from app.routes.detail_messages import INVALID_PRODUCT_ID, PRODUCT_NOT_FOUND
from app.services.product_duplicates import categories_match, find_duplicate_product
from app.services.variant_sku import _variant_key_for_lookup, generate_variant_sku

ADD_TO_EXISTING_VARIANT = "ADD_TO_EXISTING_VARIANT"
CREATE_NEW_VARIANT = "CREATE_NEW_VARIANT"
AMBIGUOUS_VARIANT_ID = "AMBIGUOUS_VARIANT_ID"

PREVIEW_TOKEN_TYPE = "inventory_receiving_preview"
PREVIEW_TOKEN_MINUTES = 30
INVALID_PREVIEW_TOKEN = "INVALID_PREVIEW_TOKEN"
RECEIVING_PREVIEW_EXPIRED = "RECEIVING_PREVIEW_EXPIRED"
_TOKEN_ALGORITHM = "HS256"

_PRODUCT_FIELDS = {
    "name": 1,
    "brand": 1,
    "categoryId": 1,
    "categoryName": 1,
    "inventory": 1,
    "isActive": 1,
    "isDraft": 1,
}


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def _stock_of(item: dict) -> int:
    try:
        return int(item.get("stock", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _variant_label(color, size) -> str:
    return f"{color} / {size}"


def _product_summary(product: dict) -> dict:
    return {
        "id": str(product["_id"]),
        "name": product.get("name"),
        "categoryId": product.get("categoryId"),
        "categoryName": product.get("categoryName"),
    }


def _check_request_lines(lines: list[ReceivingVariantInput]) -> None:
    """Reject the same variantId or the same color/size twice in one request."""
    seen_ids: set[str] = set()
    seen_keys: set[tuple[str, str]] = set()
    for line in lines:
        if line.variantId:
            if line.variantId in seen_ids:
                raise _bad_request(f"Duplicate variantId in request: {line.variantId}")
            seen_ids.add(line.variantId)
        if line.color and line.size:
            key = _variant_key_for_lookup({"color": line.color, "size": line.size})
            if key in seen_keys:
                raise _bad_request(
                    f"Duplicate color/size in request: {_variant_label(line.color, line.size)}"
                )
            seen_keys.add(key)


def _product_by_id(tenant_id: str, product_id: str) -> dict:
    if not ObjectId.is_valid(product_id):
        raise _bad_request(INVALID_PRODUCT_ID)
    # Scoped to the tenant: another store's product looks exactly like a missing one.
    product = products.find_one({"_id": ObjectId(product_id), "tenantId": tenant_id}, _PRODUCT_FIELDS)
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
    return product


def _product_by_variant_ids(tenant_id: str, variant_ids: list[str]) -> dict:
    owners: dict[str, list[dict]] = {variant_id: [] for variant_id in variant_ids}
    for product in products.find(
        {"tenantId": tenant_id, "inventory.variantId": {"$in": variant_ids}},
        _PRODUCT_FIELDS,
    ):
        product_variant_ids = {str(item.get("variantId")) for item in product.get("inventory") or []}
        for variant_id in variant_ids:
            if variant_id in product_variant_ids:
                owners[variant_id].append(product)

    shared = {variant_id: found for variant_id, found in owners.items() if len(found) > 1}
    if shared:
        candidates = {str(product["_id"]): product for found in shared.values() for product in found}
        raise HTTPException(
            status_code=409,
            detail={
                "code": AMBIGUOUS_VARIANT_ID,
                "message": (
                    "This variantId is used by more than one product. "
                    "Choose the product and send its productId."
                ),
                "variantIds": sorted(shared),
                "candidates": sorted(
                    (_product_summary(product) for product in candidates.values()),
                    key=lambda row: (str(row["name"] or ""), row["id"]),
                ),
            },
        )

    missing = [variant_id for variant_id, found in owners.items() if not found]
    if missing:
        raise _bad_request(f"variantId not found in this store: {', '.join(missing)}")

    matched = {str(found[0]["_id"]): found[0] for found in owners.values()}
    if len(matched) > 1:
        raise _bad_request("The variantIds in this request belong to different products.")
    return next(iter(matched.values()))


def _match_product(tenant_id: str, request: ReceivingPreviewRequest) -> tuple[dict | None, str, str]:
    """Returns (product or None, matchType, matchReason)."""
    if request.productId:
        return _product_by_id(tenant_id, request.productId), "explicit_product_id", "productId supplied."

    variant_ids = [line.variantId for line in request.variants if line.variantId]
    if variant_ids:
        product = _product_by_variant_ids(tenant_id, variant_ids)
        return product, "variant_id", "variantId belongs to exactly one product in this store."

    if request.name and request.categoryId:
        candidate = find_duplicate_product(
            tenant_id,
            name=request.name,
            category_id=request.categoryId,
            category_name=request.categoryName,
        )
        if candidate:
            return (
                candidate,
                "candidate",
                "An existing product has the same name and category. "
                "Select it explicitly (send its productId) to add stock to it.",
            )
    return None, "none", "No existing product matched."


def _category_in_use(tenant_id: str, category_id: str, category_name: str | None) -> bool:
    """Categories are free text on products (the categories collection is not
    populated), so "existing" means some product in the store already uses it."""
    for product in products.find({"tenantId": tenant_id}, {"categoryId": 1, "categoryName": 1}):
        if categories_match(product, category_id, category_name):
            return True
    return False


def _preview_existing_variant(line: ReceivingVariantInput, item: dict, matched_by: str) -> dict:
    existing = _stock_of(item)
    return {
        "variantId": str(item.get("variantId")),
        "proposedVariantId": None,
        "color": item.get("color"),
        "size": item.get("size"),
        "matchedBy": matched_by,
        "existingStock": existing,
        "incomingStock": line.incomingStock,
        "finalStock": existing + line.incomingStock,
        "action": ADD_TO_EXISTING_VARIANT,
    }


def _preview_new_variant(line: ReceivingVariantInput, sku_source: dict) -> dict:
    return {
        "variantId": None,
        # Same inputs the create/update paths use; display-only here.
        "proposedVariantId": generate_variant_sku(
            sku_source.get("brand"),
            sku_source.get("categoryName") or sku_source.get("categoryId"),
            line.color,
            line.size,
        ),
        "color": line.color,
        "size": line.size,
        "matchedBy": "new",
        "existingStock": 0,
        "incomingStock": line.incomingStock,
        "finalStock": line.incomingStock,
        "action": CREATE_NEW_VARIANT,
    }


def _normalized(value) -> str:
    # Same normalization as _variant_key_for_lookup: collapse spaces, lowercase.
    return " ".join(str(value or "").split()).lower()


def _variant_conflicts(line: ReceivingVariantInput, item: dict) -> bool:
    """A line that names a variantId and also a different color or size."""
    return any(
        getattr(line, field) and _normalized(getattr(line, field)) != _normalized(item.get(field))
        for field in ("color", "size")
    )


def _preview_variants(product: dict | None, lines: list[ReceivingVariantInput], sku_source: dict) -> list[dict]:
    inventory = [item for item in (product or {}).get("inventory") or [] if isinstance(item, dict)]
    by_id = {str(item.get("variantId")): item for item in inventory if item.get("variantId")}
    by_key = {_variant_key_for_lookup(item): item for item in inventory}
    used: set[str] = set()
    rows = []
    for line in lines:
        if line.variantId:
            item = by_id.get(line.variantId)
            if item is None:
                raise _bad_request(f"variantId not found on this product: {line.variantId}")
            if _variant_conflicts(line, item):
                raise _bad_request(
                    f"variantId {line.variantId} is {_variant_label(item.get('color'), item.get('size'))}, "
                    f"not {_variant_label(line.color or '-', line.size or '-')}."
                )
            row = _preview_existing_variant(line, item, "variant_id")
        else:
            item = by_key.get(_variant_key_for_lookup({"color": line.color, "size": line.size}))
            row = (
                _preview_existing_variant(line, item, "color_size")
                if item is not None
                else _preview_new_variant(line, sku_source)
            )
        if row["variantId"]:
            if row["variantId"] in used:
                raise _bad_request(f"Two lines refer to the same variant: {row['variantId']}")
            used.add(row["variantId"])
        rows.append(row)
    return rows


def _proposed_id_warnings(rows: list[dict], product: dict | None) -> list[str]:
    taken = {str(item.get("variantId")) for item in (product or {}).get("inventory") or [] if isinstance(item, dict)}
    warnings = []
    for row in rows:
        proposed = row["proposedVariantId"]
        if not proposed:
            continue
        if proposed in taken:
            warnings.append(
                f"The generated variantId {proposed} for {_variant_label(row['color'], row['size'])} "
                "clashes with another variant of this product; saving it would be rejected."
            )
        taken.add(proposed)
    return warnings


def _default_category_name(category_id: str) -> str:
    # Same fallback create-product uses when no categoryName is given.
    return category_id.replace("_", " ").replace("-", " ").title()


def _preview_signing_key() -> str:
    # Derived from SECRET_KEY so a preview token can never pass as a login
    # token (or the other way round), even though both are HS256 JWTs.
    return hmac.new(
        (SECRET_KEY or "").encode("utf-8"), b"inventory-receiving-preview:v1", hashlib.sha256
    ).hexdigest()


def _token_line(row: dict) -> dict:
    line = {"a": row["action"], "c": row["color"], "s": row["size"], "i": row["incomingStock"]}
    if row["action"] == ADD_TO_EXISTING_VARIANT:
        line.update(v=row["variantId"], e=row["existingStock"])
    else:
        line["p"] = row["proposedVariantId"]
    return line


def sign_preview_token(
    tenant_id: str,
    preview: dict,
    *,
    brand: str | None = None,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    """Everything the commit needs, signed so the browser cannot change it."""
    now = now or datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=PREVIEW_TOKEN_MINUTES)
    product = preview["product"]
    claims = {
        "typ": PREVIEW_TOKEN_TYPE,
        "rid": uuid.uuid4().hex,
        "tid": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "act": preview["action"],
        "pid": product["id"],
        "new": None,
        "conf": preview["requiresConfirmation"],
        "lines": [_token_line(row) for row in preview["variants"]],
    }
    if preview["action"] == "NEW_PRODUCT":
        claims["new"] = {
            "name": product["name"],
            "categoryId": product["categoryId"],
            "categoryName": product["categoryName"],
            "brand": brand,
        }
    ReceivingTokenClaims.model_validate(claims)  # never sign something the commit would reject
    return jwt.encode(claims, _preview_signing_key(), algorithm=_TOKEN_ALGORITHM), expires_at


def verify_preview_token(token: str) -> ReceivingTokenClaims:
    try:
        raw = jwt.decode(token, _preview_signing_key(), algorithms=[_TOKEN_ALGORITHM])
    except ExpiredSignatureError as error:
        raise HTTPException(
            status_code=400,
            detail={
                "code": RECEIVING_PREVIEW_EXPIRED,
                "message": "This preview has expired. Refresh the preview before saving.",
            },
        ) from error
    except JWTError as error:
        raise HTTPException(
            status_code=400,
            detail={"code": INVALID_PREVIEW_TOKEN, "message": "Invalid preview. Refresh the preview before saving."},
        ) from error
    try:
        return ReceivingTokenClaims.model_validate(raw)
    except ValidationError as error:
        raise HTTPException(
            status_code=400,
            detail={"code": INVALID_PREVIEW_TOKEN, "message": "Invalid preview. Refresh the preview before saving."},
        ) from error


def build_receiving_preview(tenant_id: str, request: ReceivingPreviewRequest) -> dict:
    _check_request_lines(request.variants)
    product, match_type, match_reason = _match_product(tenant_id, request)
    warnings: list[str] = []

    if product is None:
        if not request.name or not request.categoryId:
            raise _bad_request("name and categoryId are required for a new product.")
        category_name = request.categoryName or _default_category_name(request.categoryId)
        status = "existing" if _category_in_use(tenant_id, request.categoryId, request.categoryName) else "new_to_store"
        if status == "new_to_store":
            warnings.append(
                f"Category {request.categoryId} is not used by any product in this store yet. "
                "It will not be created until the product is saved; confirm it is correct."
            )
        summary = {"id": None, "name": request.name, "categoryId": request.categoryId, "categoryName": category_name}
        category = {"categoryId": request.categoryId, "categoryName": category_name, "status": status}
        sku_source = {"brand": request.brand, "categoryId": request.categoryId, "categoryName": category_name}
    else:
        status = "existing"
        summary = {
            **_product_summary(product),
            "isActive": bool(product.get("isActive")),
            "isDraft": bool(product.get("isDraft")),
        }
        category = {
            "categoryId": product.get("categoryId"),
            "categoryName": product.get("categoryName"),
            "status": status,
        }
        if request.categoryId and not categories_match(product, request.categoryId, request.categoryName):
            warnings.append(
                f"categoryId {request.categoryId} differs from this product's category "
                f"({product.get('categoryId')}); the product's category is kept."
            )
        sku_source = product

    rows = _preview_variants(product, request.variants, sku_source)
    warnings.extend(_proposed_id_warnings(rows, product))
    totals = {
        key: sum(row[key] for row in rows) for key in ("existingStock", "incomingStock", "finalStock")
    }
    result = {
        "success": True,
        "action": "NEW_PRODUCT" if product is None else "EXISTING_PRODUCT",
        "matchType": match_type,
        "matchReason": match_reason,
        "requiresConfirmation": match_type == "candidate" or status == "new_to_store",
        "product": summary,
        "category": category,
        "variants": rows,
        "totals": totals,
        "warnings": warnings,
        "previewToken": None,
        "expiresAt": None,
    }
    # A candidate is never committed: the admin re-previews with its productId.
    if match_type != "candidate":
        token, expires_at = sign_preview_token(tenant_id, result, brand=request.brand)
        result["previewToken"] = token
        result["expiresAt"] = expires_at.isoformat()
    return result
