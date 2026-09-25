from typing import Annotated

from fastapi import APIRouter, Depends

from app.models.inventory_receiving import ReceivingPreviewRequest, ReceivingPreviewResponse
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.inventory_receiving import build_receiving_preview
from app.utils.auth_dependencies import admin_tenant_id, require_permission

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post(
    "/receiving/preview",
    response_model=ReceivingPreviewResponse,
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        409: CONFLICT_RESPONSE[409],
    },
)
def preview_receiving(
    payload: ReceivingPreviewRequest,
    current_user: Annotated[dict, Depends(require_permission("inventory"))],
):
    """Preview received stock: existing + incoming = final, per variant.

    Read-only: no product, inventory, stock history, category or cache writes.
    """
    tenant_id = admin_tenant_id(current_user, payload.tenantId)
    return build_receiving_preview(tenant_id, payload)
