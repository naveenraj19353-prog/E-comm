from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RecordPayout(BaseModel):
    tenantId: Optional[str] = None
    # If omitted, settles every currently unsettled entry for the store.
    fromDate: Optional[datetime] = None
    toDate: Optional[datetime] = None
    note: Optional[str] = Field(default=None, max_length=500)


class UpdateTenantCommission(BaseModel):
    tenantId: Optional[str] = None
    platformCommissionPercent: Optional[float] = Field(
        default=None, ge=0, le=100
    )
