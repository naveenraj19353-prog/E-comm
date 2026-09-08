from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from app.database.mongo import banners, tenants
from app.models.banner import CreateBanner, UpdateBanner
from app.routes.detail_messages import (
    BANNER_NOT_FOUND,
    NO_UPDATE_FIELDS,
    TENANT_NOT_FOUND_OR_INACTIVE,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.utils.auth_dependencies import admin_tenant_id, require_admin
router = APIRouter(
    prefix="/banner",
    tags=["Banner"],
)


@router.post(
    "/create",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
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
                detail=TENANT_NOT_FOUND_OR_INACTIVE,
            )


        now = datetime.now(timezone.utc)
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


@router.get(
    "/get-all",
    responses={
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
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
                detail=TENANT_NOT_FOUND_OR_INACTIVE,
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


@router.get(
    "/active",
    responses={
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
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
                detail=TENANT_NOT_FOUND_OR_INACTIVE,
            )


        now = datetime.now(timezone.utc)


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


@router.put(
    "/update/{banner_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
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
                detail=NO_UPDATE_FIELDS,
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
                detail=BANNER_NOT_FOUND,
            )
        admin_tenant_id(
            current_user,
            existing_banner.get("tenantId"),
        )


        update_data[
            "updatedAt"
        ] = datetime.now(timezone.utc)


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
                detail=BANNER_NOT_FOUND,
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


@router.delete(
    "/delete/{banner_id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
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
                detail=BANNER_NOT_FOUND,
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
                detail=BANNER_NOT_FOUND,
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
