from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from bson import ObjectId
from app.database.mongo import users
from app.models.profile import UpdateProfile
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("/")
def get_profile(
    tenantId: str | None = None,
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if not ObjectId.is_valid(token_user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")
    user = users.find_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user["_id"] = str(user["_id"])
    return {"success": True, "data": user}


@router.put("/update-profile")
def update_profile(
    request: UpdateProfile,
    tenantId: str | None = None,
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if not ObjectId.is_valid(token_user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")
    update_data = request.model_dump(exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update.")
    update_data["updatedAt"] = datetime.utcnow()
    result = users.update_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    user = users.find_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user["_id"] = str(user["_id"])
    return {"success": True, "message": "Profile updated successfully.", "data": user}
