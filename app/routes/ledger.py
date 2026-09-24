from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.ledger import RecordPayout, UpdateTenantCommission
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services import ledger_service
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_store_owner,
    require_super_admin,
)

router = APIRouter(prefix="/ledger", tags=["Ledger"])


@router.get(
    "/statement",
    responses={400: BAD_REQUEST_RESPONSE[400], 403: FORBIDDEN_RESPONSE[403]},
)
def get_statement(
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    page: int = 1,
    page_size: Annotated[int, Query(alias="pageSize")] = 25,
    from_date: Annotated[datetime | None, Query(alias="fromDate")] = None,
    to_date: Annotated[datetime | None, Query(alias="toDate")] = None,
):
    """A store's own money statement: gross/commission/gateway fee/delivery
    charge/net per order, plus payouts and each order's paid/pending status."""
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    return {
        "success": True,
        "data": ledger_service.get_statement(
            scoped_tenant_id,
            page=page,
            page_size=page_size,
            from_date=from_date,
            to_date=to_date,
        ),
    }


@router.get(
    "/payouts",
    responses={400: BAD_REQUEST_RESPONSE[400], 403: FORBIDDEN_RESPONSE[403]},
)
def list_payouts(
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    page: int = 1,
    page_size: Annotated[int, Query(alias="pageSize")] = 25,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    return {
        "success": True,
        "data": ledger_service.get_payouts(
            scoped_tenant_id, page=page, page_size=page_size
        ),
    }


@router.post(
    "/payouts",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def create_payout(
    payload: RecordPayout,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    """Settle every unsettled ledger entry for a store (optionally scoped to
    a date range) and record the resulting payout. The amount is always
    computed from what's actually being settled, never typed in by hand."""
    if not payload.tenantId or not payload.tenantId.strip():
        raise HTTPException(status_code=400, detail="tenantId is required.")
    tenant_id = payload.tenantId.strip().lower()
    payout = ledger_service.record_payout(
        tenant_id,
        payload.note,
        current_user.get("userId"),
        from_date=payload.fromDate,
        to_date=payload.toDate,
    )
    return {"success": True, "message": "Payout recorded.", "data": payout}


@router.patch(
    "/commission",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_commission(
    payload: UpdateTenantCommission,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    """Set (or clear, by passing null) a store's negotiated commission rate."""
    if not payload.tenantId or not payload.tenantId.strip():
        raise HTTPException(status_code=400, detail="tenantId is required.")
    tenant_id = payload.tenantId.strip().lower()
    ledger_service.set_tenant_commission(tenant_id, payload.platformCommissionPercent)
    return {"success": True, "message": "Commission rate updated."}


@router.get(
    "/overview",
    responses={403: FORBIDDEN_RESPONSE[403]},
)
def get_overview(
    current_user: Annotated[dict, Depends(require_super_admin)],
    page: int = 1,
    page_size: Annotated[int, Query(alias="pageSize")] = 25,
    from_date: Annotated[datetime | None, Query(alias="fromDate")] = None,
    to_date: Annotated[datetime | None, Query(alias="toDate")] = None,
):
    """Every store's balance, for the super-admin payments dashboard."""
    return {
        "success": True,
        "data": ledger_service.platform_overview(
            page=page, page_size=page_size, from_date=from_date, to_date=to_date
        ),
    }


@router.post(
    "/entries/{order_id}/sync-delivery-charge",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def sync_delivery_charge(
    order_id: str,
    current_user: Annotated[dict, Depends(require_store_owner)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    """Retry fetching the real Delhivery charge for one order's ledger entry.

    Delhivery only finalizes freight after the shipment is manifested/picked
    up and there is no webhook for it, so this is an explicit retry rather
    than something that happens automatically on every statement view.
    """
    from bson import ObjectId

    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order ID.")
    updated = ledger_service.sync_delivery_charge_for_order(order_id, scoped_tenant_id)
    if not updated:
        return {
            "success": True,
            "message": "Delhivery hasn't finalized a charge for this order yet.",
            "updated": False,
        }
    return {"success": True, "message": "Delivery charge updated.", "updated": True}
