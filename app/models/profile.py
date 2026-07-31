from pydantic import BaseModel, EmailStr
from typing import Optional

class UpdateProfile(BaseModel):
    name: Optional[str]
    phone: Optional[str]