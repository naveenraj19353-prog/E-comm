from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from app.database.mongo import categories
from app.models.category import CreateCategory, UpdateCategory
from app.routes.detail_messages import (
    CATEGORY_NOT_FOUND,
    INVALID_CATEGORY_ID,
    NO_UPDATE_FIELDS,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.utils.auth_dependencies import admin_tenant_id, require_admin
from app.utils.category_catalog import get_catalog_categories
router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


@router.post(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def create_category(
    category: CreateCategory,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, category.tenantId)
    existing = categories.find_one(
        {
            "tenantId": tenant_id,
            "name": category.name
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Category already exists."
        )
    now = datetime.now(timezone.utc)
    payload = {
        "tenantId": tenant_id,
        "name": category.name,
        "description": category.description,
        "image": category.image,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now
    }
    result = categories.insert_one(payload)
    return {
        "success": True,
        "message": "Category created successfully.",
        "categoryId": str(result.inserted_id)
    }


@router.get("/")
def get_all_categories(tenantId: str):
    """
    Categories with at least one active product for the tenant.
    Built from the product catalog (same source as product filters),
    so new/updated product categories appear without a separate seed.
    """
    data = get_catalog_categories(tenantId)
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.get(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_category_by_id(
    id: str,
    tenantId: str
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_CATEGORY_ID
        )
    category = categories.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenantId,
            "isActive": True
        }
    )
    if not category:
        raise HTTPException(
            status_code=404,
            detail=CATEGORY_NOT_FOUND
        )
    category["_id"] = str(
        category["_id"]
    )
    return {
        "success": True,
        "data": category
    }


@router.put(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_category(
    id: str,
    category: UpdateCategory,
    current_user: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_CATEGORY_ID
        )
    tenant_id = admin_tenant_id(current_user, category.tenantId)
    update_data = category.model_dump(
        exclude_unset=True
    )
    update_data.pop("tenantId", None)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail=NO_UPDATE_FIELDS
        )
    update_data["updatedAt"] = datetime.now(timezone.utc)
    result = categories.update_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id
        },
        {
            "$set": update_data
        }
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=CATEGORY_NOT_FOUND
        )
    updated = categories.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id
        }
    )
    if updated:
        updated["_id"] = str(
            updated["_id"]
        )
    return {
        "success": True,
        "message": "Category updated successfully.",
        "data": updated
    }


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def delete_category(
    id: str,
    tenantId: str,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail=INVALID_CATEGORY_ID
        )
    result = categories.delete_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=CATEGORY_NOT_FOUND
        )
    return {
        "success": True,
        "message": "Category deleted successfully."
    }
