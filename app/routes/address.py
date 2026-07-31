from fastapi import APIRouter, HTTPException
from datetime import datetime
from bson import ObjectId

from app.database.mongo import addresses
from app.models.address import CreateAddress, UpdateAddress

router = APIRouter(
    prefix="/addresses",
    tags=["Addresses"]
)


@router.post("/create-address")
def create_address(request: CreateAddress):

    # If new address is default, remove default from others
    if request.isDefault:

        addresses.update_many(
            {
                "tenantId": request.tenantId,
                "userId": ObjectId(request.userId)
            },
            {
                "$set": {
                    "isDefault": False
                }
            }
        )

    result = addresses.insert_one({
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId),

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

        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    })

    return {
        "success": True,
        "addressId": str(result.inserted_id),
        "message": "Address added successfully."
    }

@router.get("/get-address/{userId}")
def get_addresses(userId: str, tenantId: str):

    cursor = addresses.find({
        "tenantId": tenantId,
        "userId": ObjectId(userId)
    }).sort("isDefault", -1)

    data = []

    for address in cursor:
        address["_id"] = str(address["_id"])
        address["userId"] = str(address["userId"])
        data.append(address)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.put("/update-address/{id}")
def update_address(id: str, request: UpdateAddress):

    update_data = request.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided."
        )

    # If this address becomes default,
    # remove default from other addresses
    if request.isDefault:

        address = addresses.find_one({
            "_id": ObjectId(id)
        })

        addresses.update_many(
            {
                "tenantId": request.tenantId,
                "userId": address["userId"]
            },
            {
                "$set": {
                    "isDefault": False
                }
            }
        )

    update_data["updatedAt"] = datetime.utcnow()

    result = addresses.update_one(
        {
            "_id": ObjectId(id),
            "tenantId": request.tenantId
        },
        {
            "$set": update_data
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Address not found."
        )

    return {
        "success": True,
        "message": "Address updated successfully."
    }

@router.delete("/{id}")
def delete_address(id: str, tenantId: str):

    address = addresses.find_one({
        "_id": ObjectId(id),
        "tenantId": tenantId
    })

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found."
        )

    user_id = address["userId"]
    was_default = address["isDefault"]

    addresses.delete_one({
        "_id": ObjectId(id)
    })

    # If deleted address was the default,
    # make another address the default
    if was_default:

        next_address = addresses.find_one(
            {
                "tenantId": tenantId,
                "userId": user_id
            },
            sort=[("createdAt", 1)]
        )

        if next_address:
            addresses.update_one(
                {
                    "_id": next_address["_id"]
                },
                {
                    "$set": {
                        "isDefault": True
                    }
                }
            )

    return {
        "success": True,
        "message": "Address deleted successfully."
    }