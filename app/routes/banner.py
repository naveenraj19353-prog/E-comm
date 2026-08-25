from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import banners, tenants
from app.models.banner import CreateBanner, UpdateBanner
from app.utils.auth_dependencies import admin_tenant_id, require_admin
router = APIRouter(
    prefix="/banner",
    tags=["Banner"],
)


@router.post("/create")
def create_banner(
    banner: CreateBanner,
    current_user: dict = Depends(require_admin),
):
    try:
        banner_data = banner.model_dump()
        tenant_id = admin_tenant_id(
            current_user,
            banner_data.get("tenantId"),
        )
        banner_data["tenantId"] = tenant_id


        if not tenant_id:
            raise HTTPException(
                status_code=400,
                detail="tenantId is required.",
            )
        tenant = tenants.find_one(
            {
                "tenantId": tenant_id,
                "isActive": True,
            }
        )
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail="Tenant not found or inactive.",
            )


        now = datetime.utcnow()
        banner_data["createdAt"] = now
        banner_data["updatedAt"] = now


        result = banners.insert_one(
            banner_data
        )
        return {
            "success": True,
            "message": "Banner created successfully.",
            "bannerId": str(
                result.inserted_id
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "CREATE BANNER ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to create banner.",
        )


@router.get("/get-all")
def get_banners(
    tenantId: str,
):
    try:


        tenant = tenants.find_one(
            {
                "tenantId": tenantId,
                "isActive": True,
            }
        )
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail="Tenant not found or inactive.",
            )


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
            banner["_id"] = str(
                banner["_id"]
            )
            data.append(
                banner
            )
        return {
            "success": True,
            "data": data,
            "count": len(data),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "GET BANNERS ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch banners.",
        )


@router.get("/active")
def get_active_banners(
    tenantId: str,
):
    try:


        tenant = tenants.find_one(
            {
                "tenantId": tenantId,
                "isActive": True,
            }
        )
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail="Tenant not found or inactive.",
            )


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
        banner_list = banners.find(
            query
        ).sort(
            "priority",
            1,
        )
        data = []
        for banner in banner_list:
            banner["_id"] = str(
                banner["_id"]
            )
            data.append(
                banner
            )
        return {
            "success": True,
            "data": data,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "GET ACTIVE BANNERS ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch active banners.",
        )


@router.put("/update/{banner_id}")
def update_banner(
    banner_id: str,
    banner: UpdateBanner,
    current_user: dict = Depends(require_admin),
):
    try:


        if not ObjectId.is_valid(
            banner_id
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid banner ID.",
            )


        update_data = banner.model_dump(
            exclude_unset=True,
            exclude_none=True,
        )
        if not update_data:
            raise HTTPException(
                status_code=400,
                detail="No fields provided for update.",
            )
        update_data.pop("tenantId", None)
        existing_banner = banners.find_one(
            {
                "_id": ObjectId(banner_id),
            }
        )
        if not existing_banner:
            raise HTTPException(
                status_code=404,
                detail="Banner not found.",
            )
        admin_tenant_id(
            current_user,
            existing_banner.get("tenantId"),
        )


        update_data[
            "updatedAt"
        ] = datetime.utcnow()


        result = banners.update_one(
            {
                "_id": ObjectId(
                    banner_id
                ),
            },
            {
                "$set": update_data,
            },
        )
        if result.matched_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Banner not found.",
            )


        updated_banner = banners.find_one(
            {
                "_id": ObjectId(
                    banner_id
                ),
            }
        )
        updated_banner[
            "_id"
        ] = str(
            updated_banner["_id"]
        )
        return {
            "success": True,
            "message": "Banner updated successfully.",
            "data": updated_banner,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "UPDATE BANNER ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to update banner.",
        )


@router.delete("/delete/{banner_id}")
def delete_banner(
    banner_id: str,
    current_user: dict = Depends(require_admin),
):
    try:


        if not ObjectId.is_valid(
            banner_id
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid banner ID.",
            )


        existing_banner = banners.find_one(
            {
                "_id": ObjectId(banner_id),
            }
        )
        if not existing_banner:
            raise HTTPException(
                status_code=404,
                detail="Banner not found.",
            )
        admin_tenant_id(
            current_user,
            existing_banner.get("tenantId"),
        )
        result = banners.delete_one(
            {
                "_id": ObjectId(
                    banner_id
                ),
            }
        )
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Banner not found.",
            )
        return {
            "success": True,
            "message": "Banner deleted successfully.",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "DELETE BANNER ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to delete banner.",
        )
