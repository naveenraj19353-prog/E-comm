from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    id: str
    tenantId: str | None = None
    action: str
    actor: dict[str, Any]
    entity: dict[str, Any]
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime


class AuditLogPage(BaseModel):
    success: bool = True
    data: list[AuditLogEntry]
    total: int
    page: int
    limit: int
