from fastapi import APIRouter, Depends
from app.utils.auth_dependencies import require_super_admin
router = APIRouter(
    prefix="/super-admin",
    tags=["Super Admin"],
)
@router.get("/dashboard")
def super_admin_dashboard(
    current_user: dict = Depends(require_super_admin),
):
    return {
        "success": True,
        "message": "Welcome Super Admin",
        "user": current_user,
    }
