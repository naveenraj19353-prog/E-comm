from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database.mongo import users
from app.models.user import UpdateUser
from app.utils.auth_dependencies import admin_tenant_id, require_admin

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/")
def get_users(
    tenantId: str | None = None,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    result = []
    cursor = users.find(
        {"tenantId": tenant_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    for user in cursor:
        user["_id"] = str(user["_id"])
        result.append(user)
    return {"success": True, "count": len(result), "data": result}


@router.get("/{id}")
def get_user(
    id: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": tenant_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user["_id"] = str(user["_id"])
    return {"success": True, "data": user}


@router.put("/{id}")
def update_user(
    id: str,
    request: UpdateUser,
    tenantId: str | None = None,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")
    update_data = request.model_dump(exclude_unset=True)
    update_data.pop("role", None)
    update_data.pop("tenantId", None)
    update_data.pop("password", None)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update.")
    update_data["updatedAt"] = datetime.utcnow()
    result = users.update_one(
        {"_id": ObjectId(id), "tenantId": tenant_id},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": tenant_id},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    user["_id"] = str(user["_id"])
    return {"success": True, "message": "User updated successfully.", "data": user}


@router.delete("/{id}")
def delete_user(
    id: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_admin),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")
    result = users.delete_one({"_id": ObjectId(id), "tenantId": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"success": True, "message": "User deleted successfully."}
