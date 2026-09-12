from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.database.mongo import products, tenants
from app.models.tenant import CreateTenant, RegisterStore, UpdateTenant, UpdateTenantTheme
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
from app.services.tenant_service import create_tenant_document
from app.utils.auth_dependencies import (
    require_admin,
    require_super_admin,
)
from app.utils.category_catalog import _first_product_image
from app.utils.hash import hash_password
from app.utils.jwt_handler import create_token
from app.utils.product_serialize import _resolve_image_for_response


def _safe_resolve_image(value: str | None) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        resolved = _resolve_image_for_response(value.strip())
    except Exception:
        return value.strip()
    return resolved or None


def _public_tenant_preview(tenant: dict) -> dict:
    tenant_id = str(tenant.get("tenantId") or "")
    product_query = {
        "tenantId": tenant_id,
        "isActive": True,
    }
    product_count = products.count_documents(product_query)
    preview_images: list[str] = []
    for product in products.find(product_query).sort("createdAt", -1).limit(8):
        raw = _first_product_image(product.get("images"))
        resolved = _safe_resolve_image(raw)
        if resolved and resolved not in preview_images:
            preview_images.append(resolved)
        if len(preview_images) >= 4:
            break

    theme_colors = tenant.get("themeColors") or {}
    accent = None
    if isinstance(theme_colors, dict):
        accent = theme_colors.get("primary") or theme_colors.get("secondary")

    logo = _safe_resolve_image(tenant.get("logo") if isinstance(tenant.get("logo"), str) else None)
    cover = preview_images[0] if preview_images else logo

    return {
        "tenantId": tenant_id,
        "slug": tenant.get("slug"),
        "name": tenant.get("name"),
        "logo": logo,
        "theme": tenant.get("theme") or "Custom",
        "accent": accent or "#7c3aed",
        "productCount": int(product_count),
        "coverImage": cover,
        "previewImages": preview_images,
        "dataIsolation": "Fully Isolated",
    }


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
        response_data = create_tenant_document(
            tenant_id=tenant.tenantId,
            name=tenant.name,
            slug=tenant.slug,
            email=str(tenant.email),
            password=tenant.password,
            logo=tenant.logo or "",
            theme=tenant.theme or "green",
        )
        return {
            "success": True,
            "message": "Tenant created successfully.",
            "tenantId": response_data["tenantId"],
            "id": response_data["_id"],
            "data": response_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        print("CREATE TENANT ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create tenant.",
        )


@router.post(
    "/register",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def register_store(payload: RegisterStore):
    """Public self-serve store creation (no super-admin required)."""
    try:
        slug = payload.slug.strip().lower()
        # Self-serve: tenantId matches slug for simple storefront URLs.
        response_data = create_tenant_document(
            tenant_id=slug,
            name=payload.name,
            slug=slug,
            email=str(payload.email),
            password=payload.password,
            logo="",
            theme="green",
        )
        token = create_token(
            {
                "userId": response_data["_id"],
                "tenantId": response_data["tenantId"],
                "tenantMongoId": response_data["_id"],
                "email": response_data["email"],
                "role": "admin",
                "name": response_data["name"],
            }
        )
        return {
            "success": True,
            "message": "Store created successfully.",
            "access_token": token,
            "token_type": "Bearer",
            "tenantId": response_data["tenantId"],
            "slug": response_data["slug"],
            "data": response_data,
            "user": {
                "userId": response_data["_id"],
                "name": response_data["name"],
                "email": response_data["email"],
                "tenantId": response_data["tenantId"],
                "role": "admin",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print("REGISTER STORE ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create store.",
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


@router.get("/public")
def get_public_tenants():
    """Active tenants for marketing / welcome demos (no auth, no secrets)."""
    try:
        cursor = tenants.find(
            {"isActive": True},
            {
                "password": 0,
                "email": 0,
                "adminEmail": 0,
            },
        ).sort("createdAt", -1)

        data = []
        for tenant in cursor:
            try:
                data.append(_public_tenant_preview(tenant))
            except Exception as preview_error:
                print("PUBLIC TENANT PREVIEW ERROR:", str(preview_error))
                data.append(
                    {
                        "tenantId": str(tenant.get("tenantId") or ""),
                        "slug": tenant.get("slug"),
                        "name": tenant.get("name") or "Store",
                        "logo": None,
                        "theme": tenant.get("theme") or "Custom",
                        "accent": "#7c3aed",
                        "productCount": 0,
                        "coverImage": None,
                        "previewImages": [],
                        "dataIsolation": "Fully Isolated",
                    }
                )

        return {
            "success": True,
            "count": len(data),
            "data": data,
        }
    except Exception as e:
        print("PUBLIC TENANTS ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to load public tenants.",
        )


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
