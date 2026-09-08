from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.services.s3_service import upload_image
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_admin,
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
    current_user: dict = Depends(require_admin),
):
    """
    Upload an image to S3.

    Example:
    POST /upload/image?tenantId=shopsphere&folder=products
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

    if folder not in {"products", "banners"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Folder must be either "
                "'products' or 'banners'."
            ),
        )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Image file is required.",
        )

    try:
        image_url = upload_image(
            file=file,
            tenant_id=tenant_id,
            folder=folder,
        )

        return {
            "success": True,
            "message": "Image uploaded successfully.",
            "url": image_url,
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
            detail="Failed to upload image.",
        )