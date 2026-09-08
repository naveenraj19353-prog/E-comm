from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from bson import ObjectId
from app.database.mongo import users
from app.models.profile import UpdateProfile
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
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_profile(
    tenant_id: str | None = Query(default=None, alias="tenantId"),
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if not ObjectId.is_valid(token_user_id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    user = users.find_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    user["_id"] = str(user["_id"])
    return {"success": True, "data": user}


@router.put(
    "/update-profile",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_profile(
    request: UpdateProfile,
    tenant_id: str | None = Query(default=None, alias="tenantId"),
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if not ObjectId.is_valid(token_user_id):
        raise HTTPException(status_code=400, detail=INVALID_USER_ID)
    update_data = request.model_dump(exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail=NO_UPDATE_FIELDS)
    update_data["updatedAt"] = datetime.now(timezone.utc)
    result = users.update_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    user = users.find_one(
        {
            "_id": ObjectId(token_user_id),
            "tenantId": tenant_id,
            "isActive": True,
        },
        {"password": 0, "resetToken": 0, "resetTokenExpiry": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    user["_id"] = str(user["_id"])
    return {"success": True, "message": "Profile updated successfully.", "data": user}
