from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.database.mongo import tenants
from app.models.tenant import CreateTenant, UpdateTenant, UpdateTenantTheme
from app.routes.detail_messages import (
    INVALID_TENANT_ID,
    NO_UPDATE_FIELDS,
    TENANT_NOT_FOUND,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.storefront_layout import build_storefront_layout
from app.utils.auth_dependencies import (
    require_admin,
    require_super_admin,
)
from app.utils.hash import hash_password

router = APIRouter(
    prefix="/tenants",
    tags=["Tenants"],
)


@router.post(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def create_tenant(
    tenant: CreateTenant,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    try:
        tenant_id = tenant.tenantId.strip().lower()
        name = tenant.name.strip()
        slug = tenant.slug.strip().lower()
        email = str(tenant.email).strip().lower()


        existing_tenant = tenants.find_one({
            "tenantId": tenant_id
        })
        if existing_tenant:
            raise HTTPException(
                status_code=400,
                detail="Tenant ID already exists.",
            )


        existing_slug = tenants.find_one({
            "slug": slug
        })
        if existing_slug:
            raise HTTPException(
                status_code=400,
                detail="Tenant slug already exists.",
            )


        existing_email = tenants.find_one({
            "email": email
        })
        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Tenant email already exists.",
            )


        hashed_password = hash_password(
            tenant.password
        )


        now = datetime.now(timezone.utc)


        payload = {
            "tenantId": tenant_id,
            "name": name,
            "slug": slug,
            "logo": tenant.logo or "",
            "theme": tenant.theme or "green",
            "email": email,
            "password": hashed_password,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }


        result = tenants.insert_one(
            payload
        )


        response_data = {
            **payload,
            "_id": str(result.inserted_id),
        }
        response_data.pop(
            "password",
            None,
        )
        return {
            "success": True,
            "message": "Tenant created successfully.",
            "tenantId": tenant_id,
            "id": str(result.inserted_id),
            "data": response_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(
            "CREATE TENANT ERROR:",
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to create tenant.",
        )


@router.get("/", responses={403: FORBIDDEN_RESPONSE[403]})
def get_tenants(
    current_user: Annotated[dict, Depends(require_admin)],
):


    if current_user.get("role") == "super_admin":
        query = {}


    else:
        tenant_id = current_user.get(
            "tenantId"
        )
        if not tenant_id:
            raise HTTPException(
                status_code=403,
                detail="Tenant ID missing.",
            )
        query = {
            "tenantId": tenant_id
        }
    cursor = tenants.find(
        query
    ).sort(
        "createdAt",
        -1,
    )
    data = []
    for tenant in cursor:
        tenant["_id"] = str(
            tenant["_id"]
        )

        tenant.pop(
            "password",
            None,
        )
        data.append(
            tenant
        )
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.get(
    "/tenant-id/{tenant_id}",
    responses={
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_tenant_by_tenant_id(
    tenant_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
):
    normalized_tenant_id = tenant_id.strip().lower()


    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != normalized_tenant_id
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access another tenant.",
        )
    tenant = tenants.find_one({
        "tenantId": normalized_tenant_id,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    tenant["_id"] = str(
        tenant["_id"]
    )
    tenant.pop(
        "password",
        None,
    )
    return {
        "success": True,
        "data": tenant,
    }


@router.get("/slug/{slug}", responses={404: NOT_FOUND_RESPONSE[404]})
def get_tenant_by_slug(
    slug: str,
):
    normalized_slug = slug.strip().lower()
    tenant = tenants.find_one({
        "slug": normalized_slug,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    tenant["_id"] = str(
        tenant["_id"]
    )
    tenant.pop(
        "password",
        None,
    )
    storefront_layout = build_storefront_layout(tenant)
    return {
        "success": True,
        "data": {
            **tenant,
            "storefrontLayout": storefront_layout,
        },
    }


@router.get(
    "/slug/{slug}/storefront-layout",
    responses={404: NOT_FOUND_RESPONSE[404]},
)
def get_storefront_layout_by_slug(
    slug: str,
):
    normalized_slug = slug.strip().lower()
    tenant = tenants.find_one({
        "slug": normalized_slug,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    tenant["_id"] = str(tenant["_id"])
    tenant.pop("password", None)
    layout = build_storefront_layout(tenant)
    return {
        "success": True,
        "data": {
            "tenantId": tenant.get("tenantId"),
            "slug": tenant.get("slug"),
            "name": tenant.get("name"),
            "_id": tenant["_id"],
            **layout,
        },
    }


@router.get(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_tenant_by_id(
    id: str,
    current_user: Annotated[dict, Depends(require_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    tenant = tenants.find_one({
        "_id": object_id
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )


    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != tenant.get("tenantId")
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access another tenant.",
        )
    tenant["_id"] = str(
        tenant["_id"]
    )
    tenant.pop(
        "password",
        None,
    )
    return {
        "success": True,
        "data": tenant,
    }


@router.put(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_tenant(
    id: str,
    tenant: UpdateTenant,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    update_data = tenant.model_dump(
        exclude_unset=True
    )
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail=NO_UPDATE_FIELDS,
        )


    if "name" in update_data:
        update_data["name"] = (
            update_data["name"].strip()
        )
    if "slug" in update_data:
        update_data["slug"] = (
            update_data["slug"]
            .strip()
            .lower()
        )
    if "email" in update_data:
        update_data["email"] = (
            str(update_data["email"])
            .strip()
            .lower()
        )


    if "slug" in update_data:
        existing = tenants.find_one({
            "slug": update_data["slug"],
            "_id": {
                "$ne": object_id
            },
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Tenant slug already exists.",
            )


    if "email" in update_data:
        existing = tenants.find_one({
            "email": update_data["email"],
            "_id": {
                "$ne": object_id
            },
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Tenant email already exists.",
            )


    if "password" in update_data:
        update_data["password"] = hash_password(
            update_data["password"]
        )


    update_data["updatedAt"] = datetime.now(timezone.utc)


    result = tenants.update_one(
        {
            "_id": object_id
        },
        {
            "$set": update_data
        },
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    updated = tenants.find_one({
        "_id": object_id
    })
    updated["_id"] = str(
        updated["_id"]
    )
    updated.pop(
        "password",
        None,
    )
    return {
        "success": True,
        "message": "Tenant updated successfully.",
        "data": updated,
    }


@router.patch(
    "/{id}/theme",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_tenant_theme(
    id: str,
    payload: UpdateTenantTheme,
    current_user: Annotated[dict, Depends(require_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )

    tenant = tenants.find_one({"_id": object_id})
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )

    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != tenant.get("tenantId")
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot update another tenant's theme.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No theme fields provided for update.",
        )

    update_data["updatedAt"] = datetime.now(timezone.utc)

    result = tenants.update_one(
        {"_id": object_id},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )

    updated = tenants.find_one({"_id": object_id})
    updated["_id"] = str(updated["_id"])
    updated.pop("password", None)
    return {
        "success": True,
        "message": "Theme updated successfully.",
        "data": updated,
    }


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def delete_tenant(
    id: str,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    result = tenants.delete_one({
        "_id": object_id
    })
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    return {
        "success": True,
        "message": "Tenant deleted successfully.",
    }
