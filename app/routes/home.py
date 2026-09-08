from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.routes.response_metadata import INTERNAL_SERVER_ERROR_RESPONSE
from app.services.home_service import get_home_data

router = APIRouter(prefix="/home", tags=["Home"])


@router.get("", responses={500: INTERNAL_SERVER_ERROR_RESPONSE[500]})
@router.get("/", responses={500: INTERNAL_SERVER_ERROR_RESPONSE[500]})
def get_home(
    tenant_id: Annotated[str, Query(alias="tenantId")],
    product_limit: Annotated[int, Query(alias="productLimit", ge=1, le=50)] = 10,
    category_limit: Annotated[int, Query(alias="categoryLimit", ge=1, le=50)] = 12,
):
    try:


        data = get_home_data(
            tenant_id=tenant_id,
            product_limit=product_limit,
            category_limit=category_limit,
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
