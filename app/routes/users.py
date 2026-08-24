from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database.mongo import users
from app.models.user import UpdateUser
router = APIRouter(prefix="/users", tags=["Users"])
# -------------------------------
# Get All Users
# -------------------------------
@router.get("/")
def get_users(tenantId: str):
    result = []
    cursor = users.find(
        {"tenantId": tenantId}, {"password": 0, "resetToken": 0, "resetTokenExpiry": 0}
    )
    for user in cursor:
        user["_id"] = str(user["_id"])
        result.append(user)
    return {"success": True, "count": len(result), "data": result}
# -------------------------------
# Get User By Id
# -------------------------------
@router.get("/{id}")
def get_user(id: str, tenantId: str):
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": tenantId},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user["_id"] = str(user["_id"])
    return {"success": True, "data": user}
# -------------------------------
# Update User
# -------------------------------
@router.put("/{id}")
def update_user(id: str, tenantId: str, request: UpdateUser):
    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update.")
    update_data["updatedAt"] = datetime.utcnow()
    result = users.update_one(
        {"_id": ObjectId(id), "tenantId": tenantId}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    user = users.find_one(
        {"_id": ObjectId(id), "tenantId": tenantId},
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    user["_id"] = str(user["_id"])
    return {"success": True, "message": "User updated successfully.", "data": user}
# -------------------------------
# Delete User
# -------------------------------
@router.delete("/{id}")
def delete_user(id: str, tenantId: str):
    result = users.delete_one({"_id": ObjectId(id), "tenantId": tenantId})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"success": True, "message": "User deleted successfully."}
