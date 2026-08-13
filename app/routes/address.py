from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException

from app.database.mongo import addresses
from app.models.address import CreateAddress, UpdateAddress


router = APIRouter(
    prefix="/addresses",
    tags=["Addresses"],
)


# ============================================================
# HELPERS
# ============================================================

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


# ============================================================
# CREATE ADDRESS
# ============================================================

@router.post("/create-address")
def create_address(request: CreateAddress):

    user_id = validate_object_id(request.userId, "user ID")

    # If this address is marked as default,
    # remove default status from all other addresses
    # belonging to the same user and tenant.
    if request.isDefault:
        addresses.update_many(
            {
                "tenantId": request.tenantId,
                "userId": user_id,
            },
            {
                "$set": {
                    "isDefault": False,
                }
            },
        )

    now = datetime.utcnow()

    address_data = {
        "tenantId": request.tenantId,
        "userId": user_id,

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


# ============================================================
# GET USER ADDRESSES
# ============================================================

@router.get("/get-address/{userId}")
def get_addresses(
    userId: str,
    tenantId: str,
):
    user_id = validate_object_id(userId, "user ID")

    cursor = addresses.find(
        {
            "tenantId": tenantId,
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


# ============================================================
# UPDATE ADDRESS
# ============================================================

@router.put("/update-address/{id}")
def update_address(
    id: str,
    request: UpdateAddress,
):
    address_id = validate_object_id(id, "address ID")

    # Find the existing address first
    existing_address = addresses.find_one(
        {
            "_id": address_id,
            "tenantId": request.tenantId,
        }
    )

    if not existing_address:
        raise HTTPException(
            status_code=404,
            detail="Address not found.",
        )

    # Only update fields provided by the request.
    update_data = request.model_dump(
        exclude_unset=True
    )

    # Do not allow these fields to be changed
    # through the update request.
    update_data.pop("tenantId", None)
    update_data.pop("userId", None)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided.",
        )

    # If this address is becoming the default,
    # remove default status from all other addresses
    # belonging to the same user and tenant.
    if update_data.get("isDefault") is True:

        addresses.update_many(
            {
                "tenantId": request.tenantId,
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

    update_data["updatedAt"] = datetime.utcnow()

    result = addresses.update_one(
        {
            "_id": address_id,
            "tenantId": request.tenantId,
        },
        {
            "$set": update_data,
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Address not found.",
        )

    return {
        "success": True,
        "message": "Address updated successfully.",
    }


# ============================================================
# DELETE ADDRESS
# ============================================================

@router.delete("/{id}")
def delete_address(
    id: str,
    tenantId: str,
):
    address_id = validate_object_id(id, "address ID")

    # Find address before deleting it
    address = addresses.find_one(
        {
            "_id": address_id,
            "tenantId": tenantId,
        }
    )

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found.",
        )

    user_id = address["userId"]
    was_default = address.get("isDefault", False)

    # Delete the address
    result = addresses.delete_one(
        {
            "_id": address_id,
            "tenantId": tenantId,
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Address not found.",
        )

    # If deleted address was the default,
    # automatically make another address default.
    if was_default:

        next_address = addresses.find_one(
            {
                "tenantId": tenantId,
                "userId": user_id,
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
                        "updatedAt": datetime.utcnow(),
                    }
                },
            )

    return {
        "success": True,
        "message": "Address deleted successfully.",
    }