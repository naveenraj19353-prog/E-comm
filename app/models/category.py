from pydantic import BaseModel, Field

class CreateCategory(BaseModel):
    name:str= Field(..., min_length=3, max_length=50),
    description:str = Field(..., min_length=3, max_length=300),
    image:str