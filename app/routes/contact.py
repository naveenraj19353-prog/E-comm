from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.models.contact import CreateContactMessage
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.contact_service import (
    create_contact_message,
    list_contact_messages,
    mark_contact_read,
    serialize_contact,
)
from app.utils.auth_dependencies import admin_tenant_id, require_permission

router = APIRouter(prefix="/contact", tags=["Contact"])


@router.post(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def submit_contact(payload: CreateContactMessage):
    doc = create_contact_message(
        tenant_id=payload.tenantId,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        message=payload.message,
    )
    return {"success": True, "message": serialize_contact(doc)}


@router.get(
    "/admin/list",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
    },
)
def admin_list_contact(
    current_user: Annotated[dict, Depends(require_permission("customers"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    data = list_contact_messages(scoped)
    unread = sum(1 for item in data if item.get("status") != "read")
    return {"success": True, "count": len(data), "unread": unread, "data": data}


@router.patch(
    "/admin/{message_id}/read",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def admin_mark_contact_read(
    message_id: str,
    current_user: Annotated[dict, Depends(require_permission("customers"))],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    message = mark_contact_read(message_id=message_id, tenant_id=scoped)
    return {"success": True, "message": message}
