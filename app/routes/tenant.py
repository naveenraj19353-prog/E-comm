from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import tenants
from app.models.tenant import CreateTenant, UpdateTenant
from app.utils.auth_dependencies import require_super_admin


router = APIRouter(
    prefix="/tenants",
    tags=["Tenants"],
)


# ==========================================================
# CREATE TENANT
# SUPER ADMIN ONLY
# ==========================================================

@router.post("/")
def create_tenant(
    tenant: CreateTenant,
    current_user: dict = Depends(require_super_admin),
):
    try:
        # Normalize tenantId
        tenant_id = tenant.tenantId.strip().upper()

        # Check whether tenantId already exists
        existing_tenant_id = tenants.find_one({
            "tenantId": {
                "$regex": f"^{tenant_id}$",
                "$options": "i",
            }
        })

        if existing_tenant_id:
            raise HTTPException(
                status_code=400,
                detail=f"Tenant ID '{tenant.tenantId}' already exists.",
            )

        # Check duplicate slug
        slug = tenant.slug.strip().lower()

        existing_slug = tenants.find_one({
            "slug": {
                "$regex": f"^{slug}$",
                "$options": "i",
            }
        })

        if existing_slug:
            raise HTTPException(
                status_code=400,
                detail="Tenant slug already exists.",
            )

        now = datetime.utcnow()

        payload = {
            "tenantId": tenant_id,
            "name": tenant.name.strip(),
            "slug": slug,
            "logo": tenant.logo or "",
            "theme": tenant.theme or "green",
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }

        result = tenants.insert_one(payload)

        return {
            "success": True,
            "message": "Tenant created successfully.",
            "tenantId": tenant_id,
            "id": str(result.inserted_id),
            "data": {
                **payload,
                "_id": str(result.inserted_id),
            },
        }

    except HTTPException:
        raise

    except Exception as e:
        print("CREATE TENANT ERROR:", str(e))

        raise HTTPException(
            status_code=500,
            detail=f"Failed to create tenant: {str(e)}",
        )
# ==========================================================
# GET ALL TENANTS
# PUBLIC
# ==========================================================

@router.get("/")
def get_all_tenants():

    data = []

    cursor = tenants.find({}).sort(
        "createdAt",
        -1,
    )

    for tenant in cursor:
        tenant["_id"] = str(
            tenant["_id"]
        )

        data.append(tenant)

    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


# ==========================================================
# GET TENANT BY TENANT ID
# PUBLIC
# ==========================================================

@router.get("/tenant-id/{tenant_id}")
def get_tenant_by_tenant_id(
    tenant_id: str,
):
    tenant = tenants.find_one({
        "tenantId": tenant_id,
        "isActive": True,
    })

    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found.",
        )

    tenant["_id"] = str(
        tenant["_id"]
    )

    return {
        "success": True,
        "data": tenant,
    }


# ==========================================================
# GET TENANT BY SLUG
# PUBLIC
# ==========================================================

@router.get("/slug/{slug}")
def get_tenant_by_slug(
    slug: str,
):
    tenant = tenants.find_one({
        "slug": slug,
        "isActive": True,
    })

    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found.",
        )

    tenant["_id"] = str(
        tenant["_id"]
    )

    return {
        "success": True,
        "data": tenant,
    }


# ==========================================================
# GET TENANT BY MONGODB ID
# PUBLIC
# ==========================================================

@router.get("/{id}")
def get_tenant_by_id(
    id: str,
):
    try:
        object_id = ObjectId(id)

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid tenant ID.",
        )

    tenant = tenants.find_one({
        "_id": object_id,
    })

    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found.",
        )

    tenant["_id"] = str(
        tenant["_id"]
    )

    return {
        "success": True,
        "data": tenant,
    }


# ==========================================================
# UPDATE TENANT
# SUPER ADMIN ONLY
# ==========================================================

@router.put("/{id}")
def update_tenant(
    id: str,
    tenant: UpdateTenant,
    current_user: dict = Depends(require_super_admin),
):
    try:
        object_id = ObjectId(id)

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid tenant ID.",
        )

    update_data = tenant.model_dump(
        exclude_unset=True,
    )

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update.",
        )

    if "slug" in update_data:
        existing = tenants.find_one({
            "slug": update_data["slug"],
            "_id": {
                "$ne": object_id,
            },
        })

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Tenant slug already exists.",
            )

    update_data["updatedAt"] = datetime.utcnow()

    result = tenants.update_one(
        {
            "_id": object_id,
        },
        {
            "$set": update_data,
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found.",
        )

    updated = tenants.find_one({
        "_id": object_id,
    })

    updated["_id"] = str(
        updated["_id"]
    )

    return {
        "success": True,
        "message": "Tenant updated successfully.",
        "data": updated,
    }


# ==========================================================
# DELETE TENANT
# SUPER ADMIN ONLY
# ==========================================================

@router.delete("/{id}")
def delete_tenant(
    id: str,
    current_user: dict = Depends(require_super_admin),
):
    try:
        object_id = ObjectId(id)

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid tenant ID.",
        )

    result = tenants.delete_one({
        "_id": object_id,
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found.",
        )

    return {
        "success": True,
        "message": "Tenant deleted successfully.",
    }