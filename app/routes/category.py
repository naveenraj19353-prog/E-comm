from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database.mongo import categories
from app.models.category import CreateCategory, UpdateCategory
from app.utils.auth_dependencies import admin_tenant_id, require_admin
router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)
# categories.update_many(
#     {"tenantId": {"$exists": True}},
#     [
#         {
#             "$set": {
#                 "tenantId": {
#                     "$toLower": "$tenantId"
#                 }
#             }
#         }
#     ],
# )
# ==================================================
# CREATE CATEGORY
# ==================================================
@router.post("/")
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
    now = datetime.utcnow()
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
# ==================================================
# GET ALL CATEGORIES
# ==================================================
@router.get("/")
def get_all_categories(tenantId: str):
    data = []
    cursor = categories.find(
        {
            "tenantId": tenantId,
            "isActive": True
        }
    ).sort("createdAt", 1)
    for category in cursor:
        category["_id"] = str(
            category["_id"]
        )
        data.append(category)
    return {
        "success": True,
        "count": len(data),
        "data": data
    }
# ==================================================
# GET CATEGORY BY ID
# ==================================================
@router.get("/{id}")
def get_category_by_id(
    id: str,
    tenantId: str
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid category ID."
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
            detail="Category not found."
        )
    category["_id"] = str(
        category["_id"]
    )
    return {
        "success": True,
        "data": category
    }
# ==================================================
# UPDATE CATEGORY
# ==================================================
@router.put("/{id}")
def update_category(
    id: str,
    category: UpdateCategory,
    current_user: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid category ID."
        )
    tenant_id = admin_tenant_id(current_user, category.tenantId)
    update_data = category.model_dump(
        exclude_unset=True
    )
    update_data.pop("tenantId", None)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update."
        )
    update_data["updatedAt"] = datetime.utcnow()
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
            detail="Category not found."
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
# ==================================================
# DELETE CATEGORY
# ==================================================
@router.delete("/{id}")
def delete_category(
    id: str,
    tenantId: str,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=400,
            detail="Invalid category ID."
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
            detail="Category not found."
        )
    return {
        "success": True,
        "message": "Category deleted successfully."
    }
