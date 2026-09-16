from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.mongo import carts, products, users, wishlists
from app.models.user import UpdateUser
from app.routes.detail_messages import (
    INVALID_USER_ID,
    NO_UPDATE_FIELDS,
    USER_NOT_FOUND,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.utils.auth_dependencies import admin_tenant_id, require_admin

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def get_users(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    result = []
    cursor = users.find(
        {"tenantId": scoped_tenant_id, "role": "customer"},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    customer_docs = list(cursor)
    user_ids = [user["_id"] for user in customer_docs]
    activity_query = {
        "tenantId": scoped_tenant_id,
        "userId": {"$in": user_ids},
    }
    cart_docs = list(carts.find(activity_query))
    wishlist_docs = list(wishlists.find(activity_query))
    product_ids = {
        item["productId"]
        for item in [*cart_docs, *wishlist_docs]
        if isinstance(item.get("productId"), ObjectId)
    }
    product_details = {
        product["_id"]: {
            "name": product.get("name", "Product"),
            "category": str(
                product.get("categoryName")
                or product.get("categoryId")
                or "Uncategorized"
            ),
        }
        for product in products.find(
            {
                "_id": {"$in": list(product_ids)},
                "tenantId": scoped_tenant_id,
            },
            {"name": 1, "categoryName": 1, "categoryId": 1},
        )
    }
    carts_by_user: dict[ObjectId, list] = {}
    wishlists_by_user: dict[ObjectId, list] = {}
    for item in cart_docs:
        product = product_details.get(item["productId"], {})
        carts_by_user.setdefault(item["userId"], []).append(
            {
                "productId": str(item["productId"]),
                "name": product.get("name", "Product"),
                "category": product.get("category", "Uncategorized"),
                "quantity": int(item.get("quantity", 0) or 0),
            }
        )
    for item in wishlist_docs:
        product = product_details.get(item["productId"], {})
        wishlists_by_user.setdefault(item["userId"], []).append(
            {
                "productId": str(item["productId"]),
                "name": product.get("name", "Product"),
                "category": product.get("category", "Uncategorized"),
            }
        )

    for user in customer_docs:
        user_id = user["_id"]
        cart_items = carts_by_user.get(user_id, [])
        wishlist_items = wishlists_by_user.get(user_id, [])
        user["activity"] = {
            "cart": cart_items,
            "cartCount": sum(item["quantity"] for item in cart_items),
            "wishlist": wishlist_items,
            "wishlistCount": len(wishlist_items),
        }
        user["_id"] = str(user["_id"])
        result.append(user)
    return {"success": True, "count": len(result), "data": result}


@router.get(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_user(
    id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": scoped_tenant_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    user["_id"] = str(user["_id"])
    return {"success": True, "data": user}


@router.put(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_user(
    id: str,
    request: UpdateUser,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    update_data = request.model_dump(exclude_unset=True)
    update_data.pop("role", None)
    update_data.pop("tenantId", None)
    update_data.pop("password", None)
    if not update_data:
        raise HTTPException(status_code=400, detail=NO_UPDATE_FIELDS)
    update_data["updatedAt"] = datetime.now(timezone.utc)
    result = users.update_one(
        {"_id": ObjectId(id), "tenantId": scoped_tenant_id},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": scoped_tenant_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    user["_id"] = str(user["_id"])
    return {"success": True, "message": "User updated successfully.", "data": user}


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def delete_user(
    id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    result = users.delete_one(
        {"_id": ObjectId(id), "tenantId": scoped_tenant_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    return {"success": True, "message": "User deleted successfully."}
