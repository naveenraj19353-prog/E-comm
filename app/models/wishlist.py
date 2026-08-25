from typing import Optional
from pydantic import BaseModel, StrictStr


class WishList(BaseModel):
    tenantId: Optional[StrictStr] = None
    userId: Optional[str] = None
    productId: str
