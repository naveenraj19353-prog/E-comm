from pydantic import BaseModel, Field, StrictStr


class MenuLoginRequest(BaseModel):
    tenantId: StrictStr = Field(..., min_length=1, max_length=100)
    phone: StrictStr = Field(..., min_length=8, max_length=20)
    password: StrictStr = Field(..., min_length=4, max_length=32)
    counterNumber: StrictStr = Field(..., min_length=1, max_length=40)


class PlaceMenuOrderRequest(BaseModel):
    counterNumber: StrictStr | None = Field(default=None, max_length=40)
