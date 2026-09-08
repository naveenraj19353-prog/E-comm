from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import addresses
from app.models.address import CreateAddress, UpdateAddress
from app.routes.response_metadata import FORBIDDEN_RESPONSE
from app.utils.auth_dependencies import customer_scope, require_customer
router = APIRouter(
    prefix="/addresses",
    tags=["Addresses"],
)

BAD_REQUEST_RESPONSE = {
    400: {
        "description": "Invalid request or object identifier.",
    }
}
ADDRESS_NOT_FOUND_MESSAGE = "Address not found."
ADDRESS_NOT_FOUND_RESPONSE = {
    "description": ADDRESS_NOT_FOUND_MESSAGE,
}
USER_ID_FIELD = "user ID"


def validate_object_id(value: str, field_name: str = "ID") -> ObjectId:
    """
    Convert string to MongoDB ObjectId safely.
    """
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}.",
        )


@router.post(
    "/create-address",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def create_address(
    request: CreateAddress,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    user_object_id = validate_object_id(user_id, USER_ID_FIELD)
    if request.isDefault:
        addresses.update_many(
            {
                "tenantId": tenant_id,
                "userId": user_object_id,
            },
            {
                "$set": {
                    "isDefault": False,
                }
            },
        )
    now = datetime.now(timezone.utc)
    address_data = {
        "tenantId": tenant_id,
        "userId": user_object_id,
        "fullName": request.fullName,
        "phone": request.phone,
        "addressLine1": request.addressLine1,
        "addressLine2": request.addressLine2,
        "city": request.city,
        "state": request.state,
        "country": request.country,
        "postalCode": request.postalCode,
        "addressType": request.addressType,
        "isDefault": request.isDefault,
        "createdAt": now,
        "updatedAt": now,
    }
    result = addresses.insert_one(address_data)
    return {
        "success": True,
        "addressId": str(result.inserted_id),
        "message": "Address added successfully.",
    }


@router.get(
    "/get-address/{userId}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def get_addresses(
    userId: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    if userId != token_user_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another user's addresses.",
        )
    user_id = validate_object_id(token_user_id, USER_ID_FIELD)
    cursor = addresses.find(
        {
            "tenantId": tenant_id,
            "userId": user_id,
        }
    ).sort(
        [
            ("isDefault", -1),
            ("createdAt", -1),
        ]
    )
    data = []
    for address in cursor:
        address["_id"] = str(address["_id"])
        address["userId"] = str(address["userId"])
        data.append(address)
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.put(
    "/update-address/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: ADDRESS_NOT_FOUND_RESPONSE,
    },
)
def update_address(
    id: str,
    request: UpdateAddress,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    address_id = validate_object_id(id, "address ID")
    existing_address = addresses.find_one(
        {
            "_id": address_id,
            "tenantId": tenant_id,
            "userId": validate_object_id(user_id, USER_ID_FIELD),
        }
    )
    if not existing_address:
        raise HTTPException(
            status_code=404,
            detail=ADDRESS_NOT_FOUND_MESSAGE,
        )

    update_data = request.model_dump(exclude_unset=True)


    update_data.pop("tenantId", None)
    update_data.pop("userId", None)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided.",
        )


    if update_data.get("isDefault") is True:
        addresses.update_many(
            {
                "tenantId": tenant_id,
                "userId": existing_address["userId"],
                "_id": {
                    "$ne": address_id,
                },
            },
            {
                "$set": {
                    "isDefault": False,
                }
            },
        )
    update_data["updatedAt"] = datetime.now(timezone.utc)
    result = addresses.update_one(
        {
            "_id": address_id,
            "tenantId": tenant_id,
        },
        {
            "$set": update_data,
        },
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=ADDRESS_NOT_FOUND_MESSAGE,
        )
    return {
        "success": True,
        "message": "Address updated successfully.",
    }


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: ADDRESS_NOT_FOUND_RESPONSE,
    },
)
def delete_address(
    id: str,
    tenantId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    address_id = validate_object_id(id, "address ID")
    address = addresses.find_one(
        {
            "_id": address_id,
            "tenantId": tenant_id,
            "userId": validate_object_id(user_id, USER_ID_FIELD),
        }
    )
    if not address:
        raise HTTPException(
            status_code=404,
            detail=ADDRESS_NOT_FOUND_MESSAGE,
        )
    user_id = address["userId"]
    was_default = address.get("isDefault", False)

    result = addresses.delete_one(
        {
            "_id": address_id,
            "tenantId": tenant_id,
            "userId": address["userId"],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=ADDRESS_NOT_FOUND_MESSAGE,
        )


    if was_default:
        next_address = addresses.find_one(
            {
                "tenantId": tenant_id,
                "userId": address["userId"],
            },
            sort=[
                ("createdAt", 1),
            ],
        )
        if next_address:
            addresses.update_one(
                {
                    "_id": next_address["_id"],
                },
                {
                    "$set": {
                        "isDefault": True,
                        "updatedAt": datetime.now(timezone.utc),
                    }
                },
            )
    return {
        "success": True,
        "message": "Address deleted successfully.",
    }
