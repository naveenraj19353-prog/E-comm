from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from app.database.mongo import banners
from app.models.banner import CreateBanner, UpdateBanner


router = APIRouter(
    prefix="/banner",
    tags=["Banner"],
)


@router.post("/create")
def create_banner(banner: CreateBanner):

    banner_data = banner.model_dump()

    now = datetime.utcnow()

    banner_data["createdAt"] = now
    banner_data["updatedAt"] = now

    result = banners.insert_one(banner_data)

    return {
        "message": "Banner created successfully",
        "bannerId": str(result.inserted_id),
    }


@router.get("/get-all")
def get_banners(tenantId: str):

    banner_list = banners.find(
        {
            "tenantId": tenantId,
        }
    ).sort(
        "priority",
        1,
    )

    data = []

    for banner in banner_list:

        banner["_id"] = str(banner["_id"])

        data.append(banner)

    return {
        "data": data,
        "count": len(data),
    }


@router.get("/active")
def get_active_banners(tenantId: str):

    now = datetime.utcnow()

    query = {
        "tenantId": tenantId,
        "isActive": True,
        "$or": [
            {
                "startDate": None,
            },
            {
                "startDate": {
                    "$lte": now,
                },
            },
        ],
        "$and": [
            {
                "$or": [
                    {
                        "endDate": None,
                    },
                    {
                        "endDate": {
                            "$gte": now,
                        },
                    },
                ]
            }
        ],
    }

    banner_list = banners.find(query).sort(
        "priority",
        1,
    )

    data = []

    for banner in banner_list:

        banner["_id"] = str(banner["_id"])

        data.append(banner)

    return {
        "data": data,
    }


@router.put("/update/{banner_id}")
def update_banner(
    banner_id: str,
    banner: UpdateBanner,
):

    if not ObjectId.is_valid(banner_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid banner ID",
        )

    update_data = {
        key: value
        for key, value in banner.model_dump().items()
        if value is not None
    }

    update_data["updatedAt"] = datetime.utcnow()

    result = banners.update_one(
        {
            "_id": ObjectId(banner_id),
        },
        {
            "$set": update_data,
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Banner not found",
        )

    return {
        "message": "Banner updated successfully",
    }


@router.delete("/delete/{banner_id}")
def delete_banner(banner_id: str):

    if not ObjectId.is_valid(banner_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid banner ID",
        )

    result = banners.delete_one(
        {
            "_id": ObjectId(banner_id),
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Banner not found",
        )

    return {
        "message": "Banner deleted successfully",
    }