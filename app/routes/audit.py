from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database.mongo import audit_logs
from app.models.audit_log import AuditLogEntry, AuditLogPage
from app.utils.auth_dependencies import admin_tenant_id, require_admin

router = APIRouter(prefix="/audit-logs", tags=["Audit"])


def _serialize(document: dict) -> dict:
    return {
        "id": str(document.get("_id")),
        "tenantId": document.get("tenantId"),
        "action": document.get("action"),
        "actor": document.get("actor") or {},
        "entity": document.get("entity") or {},
        "before": document.get("before"),
        "after": document.get("after"),
        "metadata": document.get("metadata") or {},
        "createdAt": document.get("createdAt"),
    }


@router.get("", response_model=AuditLogPage)
def list_audit_logs(
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
    action: str | None = None,
    entity_type: Annotated[str | None, Query(alias="entityType")] = None,
    entity_id: Annotated[str | None, Query(alias="entityId")] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: Annotated[dict, Depends(require_admin)] = None,
):
    scoped_tenant_id = admin_tenant_id(current_user, tenant_id)
    query: dict = {"tenantId": scoped_tenant_id}
    if action:
        query["action"] = action.strip()
    if entity_type:
        query["entity.type"] = entity_type.strip()
    if entity_id:
        query["entity.id"] = entity_id.strip()
    total = audit_logs.count_documents(query)
    skip = (page - 1) * limit
    rows = audit_logs.find(query).sort("createdAt", -1).skip(skip).limit(limit)
    return {
        "data": [_serialize(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }
