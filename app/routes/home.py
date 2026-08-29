from fastapi import APIRouter, HTTPException, Query
from app.services.home_service import get_home_data
router = APIRouter(prefix="/home", tags=["Home"])


@router.get("")
@router.get("/")
def get_home(
    tenantId: str,
    productLimit: int = Query(default=10, ge=1, le=50),
    categoryLimit: int = Query(default=12, ge=1, le=50),
):
    try:


        data = get_home_data(
            tenant_id=tenantId, product_limit=productLimit, category_limit=categoryLimit
        )


        return {
            "success": True,
            "message": "Home data fetched successfully.",
            "data": data,
        }
    except Exception as e:
        print("====================================")
        print("HOME API ERROR")
        print(type(e).__name__)
        print(str(e))
        print("====================================")
        raise HTTPException(status_code=500, detail="Unable to load home page.")
