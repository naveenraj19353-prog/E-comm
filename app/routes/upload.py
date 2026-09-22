from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.services.s3_service import upload_image
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_any_permission,
)


router = APIRouter(
    prefix="/upload",
    tags=["Upload"],
)


@router.post("/image")
async def upload_image_file(
    tenantId: str,
    folder: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(
        require_any_permission(
            "products_update",
            "inventory",
            "banners",
            "layout",
        )
    ),
):
    """
    Upload an image to S3.

    Example:
    POST /upload/image?tenantId=your-store&folder=products
    """

    tenant_id = admin_tenant_id(
        current_user,
        tenantId,
    )

    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="tenantId is required.",
        )

    if folder not in {"products", "banners", "branding"}:
        raise HTTPException(
            status_code=400,
            detail="Folder must be 'products', 'banners', or 'branding'.",
        )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Image file is required.",
        )

    try:
        uploaded = upload_image(
            file=file,
            tenant_id=tenant_id,
            folder=folder,
        )

        return {
            "success": True,
            "message": "Image uploaded successfully.",
            "key": uploaded["key"],
            "url": uploaded["url"],
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except RuntimeError as e:
        print("S3 UPLOAD ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail=str(e) or "Failed to upload image.",
        )
