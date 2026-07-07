from fastapi import APIRouter, HTTPException
from datetime import datetime
from bson import ObjectId

from app.database.mongo import users
from app.models.profile import UpdateProfile

router = APIRouter(
    prefix="/profile",
    tags=["Profile"]
)

@router.get("/")
def get_profile(tenantId: str, userId: str):

    user = users.find_one(
        {
            "_id": ObjectId(userId),
            "tenantId": tenantId,
            "isActive": True
        },
        {
            "password": 0,
            "resetToken": 0,
            "resetTokenExpiry": 0
        }
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    user["_id"] = str(user["_id"])

    return {
        "success": True,
        "data": user
    }

@router.put("/update-profile")
def update_profile(
    tenantId: str,
    userId: str,
    request: UpdateProfile
):

    update_data = request.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update."
        )

    update_data["updatedAt"] = datetime.utcnow()

    result = users.update_one(
        {
            "_id": ObjectId(userId),
            "tenantId": tenantId,
            "isActive": True
        },
        {
            "$set": update_data
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    user = users.find_one(
        {
            "_id": ObjectId(userId)
        },
        {
            "password": 0,
            "resetToken": 0,
            "resetTokenExpiry": 0
        }
    )

    user["_id"] = str(user["_id"])

    return {
        "success": True,
        "message": "Profile updated successfully.",
        "data": user
    }