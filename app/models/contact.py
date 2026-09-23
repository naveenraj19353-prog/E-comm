from pydantic import BaseModel, Field


class CreateContactMessage(BaseModel):
    tenantId: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    phone: str = Field(default="", max_length=20)
    message: str = Field(min_length=10, max_length=2000)
