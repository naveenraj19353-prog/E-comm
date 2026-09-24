from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.billing import SetBillingExempt
from app.routes.response_metadata import (
    BAD_GATEWAY_RESPONSE,
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    SERVICE_UNAVAILABLE_RESPONSE,
)
from app.services import billing_service
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_store_owner,
    require_super_admin,
)

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get(
    "/status",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_billing_status(
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    """The store's trial / subscription standing, for the admin billing page."""
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    tenant = billing_service.find_tenant(scoped_tenant_id)
    return {"success": True, "data": billing_service.billing_summary(tenant)}


@router.post(
    "/subscribe",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        502: BAD_GATEWAY_RESPONSE[502],
        503: SERVICE_UNAVAILABLE_RESPONSE[503],
    },
)
def subscribe(
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    """Start (or resume) the store's monthly subscription.

    Returns Razorpay's hosted page where the owner authorizes auto-pay. The
    store flips to `active` when Razorpay's webhook confirms the first charge.
    """
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    return {
        "success": True,
        "data": billing_service.create_subscription_for_tenant(scoped_tenant_id),
    }


@router.patch(
    "/exempt",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def set_exempt(
    payload: SetBillingExempt,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    """Waive billing for a store (demo stores, partners) or reinstate it."""
    if not payload.tenantId or not payload.tenantId.strip():
        raise HTTPException(status_code=400, detail="tenantId is required.")
    summary = billing_service.set_billing_exempt(
        payload.tenantId.strip().lower(), payload.exempt
    )
    return {"success": True, "data": summary}


@router.get(
    "/overview",
    responses={403: FORBIDDEN_RESPONSE[403]},
)
def get_billing_overview(
    current_user: Annotated[dict, Depends(require_super_admin)],
    page: int = 1,
    page_size: Annotated[int, Query(alias="pageSize")] = 25,
):
    """Every store's billing status, for the super-admin billing screen."""
    return {
        "success": True,
        "data": billing_service.billing_overview(page=page, page_size=page_size),
    }
