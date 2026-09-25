from typing import Annotated

from fastapi import APIRouter, Depends

from app.models.inventory_receiving import (
    ReceivingCommitRequest,
    ReceivingCommitResponse,
    ReceivingPreviewRequest,
    ReceivingPreviewResponse,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.inventory_receiving import build_receiving_preview, verify_preview_token
from app.services.inventory_receiving_commit import commit_receiving
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


@router.post(
    "/receiving/commit",
    response_model=ReceivingCommitResponse,
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        409: CONFLICT_RESPONSE[409],
    },
)
def commit_receiving_stock(
    payload: ReceivingCommitRequest,
    current_user: Annotated[dict, Depends(require_permission("inventory"))],
):
    """Apply a confirmed preview (its signed previewToken) in one transaction.

    Stock only ever increases; a repeated commit returns the original result.
    """
    claims = verify_preview_token(payload.previewToken)
    tenant_id = admin_tenant_id(current_user, claims.tid)
    return commit_receiving(
        claims,
        tenant_id=tenant_id,
        user=current_user,
        confirm=payload.confirm,
        note=payload.note,
    )
