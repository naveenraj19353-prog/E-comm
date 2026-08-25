from pydantic import BaseModel, Field
from typing import Optional
class UpdateProfile(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)
