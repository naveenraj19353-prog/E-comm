from pydantic import BaseModel, Field
from typing import Optional

class CreateCategory(BaseModel):
    name:str= Field(..., min_length=3, max_length=50),
    description:str = Field(..., min_length=3, max_length=300)
    image:str

class UpdateCategory(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    isActive: Optional[bool] = None