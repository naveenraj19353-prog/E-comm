from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from app.database.mongo import carts, products, tenants, users, wishlists
from app.models.user import CreateAdminUser, UpdateStoreManager, UpdateUser
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
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_permission,
    require_store_owner,
)
from app.utils.hash import hash_password
from app.services.store_permissions import (
    normalize_permissions,
    permissions_for_staff_doc,
)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def get_users(
    current_user: Annotated[dict, Depends(require_permission("customers"))],
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


def _json_date(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _serialize_staff(user: dict) -> dict:
    return {
        "_id": str(user["_id"]),
        "tenantId": user.get("tenantId"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "role": user.get("role"),
        "isActive": user.get("isActive", True),
        "permissions": permissions_for_staff_doc(user),
        "createdAt": _json_date(user.get("createdAt")),
        "updatedAt": _json_date(user.get("updatedAt")),
    }


@router.get(
    "/store-managers",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def list_store_managers(
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    docs = list(
        users.find(
            {"tenantId": scoped_tenant_id, "role": "store_manager"},
            {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
        )
    )
    return {
        "success": True,
        "count": len(docs),
        "data": [_serialize_staff(doc) for doc in docs],
    }


@router.post(
    "/store-managers",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def create_store_manager(
    request: CreateAdminUser,
    current_user: Annotated[dict, Depends(require_store_owner)],
):
    scoped_tenant_id = admin_tenant_id(current_user, request.tenantId)
    tenant = tenants.find_one({"tenantId": scoped_tenant_id, "isActive": True})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or inactive.")
    email = str(request.email).strip().lower()
    if str(tenant.get("email") or "").strip().lower() == email:
        raise HTTPException(
            status_code=400,
            detail="This email is already used by the store admin.",
        )
    existing = users.find_one({"tenantId": scoped_tenant_id, "email": email})
    if existing:
        role = existing.get("role")
        if role == "store_manager":
            raise HTTPException(
                status_code=400,
                detail="This email is already a store manager on this store.",
            )
        if role == "customer":
            raise HTTPException(
                status_code=400,
                detail="This email is already used by a customer. Use a different email.",
            )
        raise HTTPException(status_code=400, detail="Email already exists.")
    phone = str(request.phone or "").strip() or None
    if phone:
        phone_taken = users.find_one({
            "tenantId": scoped_tenant_id,
            "phone": phone,
        })
        if phone_taken:
            raise HTTPException(
                status_code=400,
                detail="This phone number is already used on this store.",
            )
    try:
        hashed = hash_password(request.password)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Password is invalid or too long.",
        )
    now = datetime.now(timezone.utc)
    payload = {
        "tenantId": scoped_tenant_id,
        "name": request.name.strip(),
        "email": email,
        "phone": phone,
        "password": hashed,
        "role": "store_manager",
        "permissions": normalize_permissions(
            request.permissions,
            missing_means_full=False,
        ),
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        result = users.insert_one(payload)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=400,
            detail="A user with this email or phone already exists on this store.",
        )
    created = users.find_one(
        {"_id": result.inserted_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    return {
        "success": True,
        "message": "Store manager created.",
        "data": _serialize_staff(created or {**payload, "_id": result.inserted_id}),
    }


@router.delete(
    "/store-managers/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def delete_store_manager(
    id: str,
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    result = users.delete_one(
        {
            "_id": ObjectId(id),
            "tenantId": scoped_tenant_id,
            "role": "store_manager",
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    return {"success": True, "message": "Store manager removed."}


@router.put(
    "/store-managers/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_store_manager(
    id: str,
    request: UpdateStoreManager,
    current_user: Annotated[dict, Depends(require_store_owner)],
):
    scoped_tenant_id = admin_tenant_id(current_user, request.tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    permissions = normalize_permissions(
        request.permissions,
        missing_means_full=False,
    )
    result = users.update_one(
        {
            "_id": ObjectId(id),
            "tenantId": scoped_tenant_id,
            "role": "store_manager",
        },
        {
            "$set": {
                "permissions": permissions,
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    updated = users.find_one(
        {"_id": ObjectId(id)},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    return {
        "success": True,
        "message": "Store manager permissions updated.",
        "data": _serialize_staff(updated or {}),
    }


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
    current_user: Annotated[dict, Depends(require_permission("customers"))],
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
    current_user: Annotated[dict, Depends(require_permission("customers"))],
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
    current_user: Annotated[dict, Depends(require_permission("customers"))],
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
