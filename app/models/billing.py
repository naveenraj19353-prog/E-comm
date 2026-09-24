from typing import Optional

from pydantic import BaseModel


class SetBillingExempt(BaseModel):
    tenantId: Optional[str] = None
    exempt: bool
