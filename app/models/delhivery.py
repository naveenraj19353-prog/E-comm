from typing import Optional

from pydantic import BaseModel, Field


class DelhiveryConnectRequest(BaseModel):
    enabled: bool = False
    apiToken: Optional[str] = Field(default=None, min_length=8, max_length=200)
    pickupLocationName: Optional[str] = Field(default=None, max_length=120)


class DelhiveryWarehouseRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: str = Field(..., min_length=3, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    address: str = Field(..., min_length=3, max_length=350)
    city: str = Field(..., min_length=1, max_length=80)
    country: str = Field(default="India", max_length=80)
    pin: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    return_address: Optional[str] = Field(default=None, max_length=350)
    return_pin: Optional[str] = Field(default=None, max_length=6, pattern=r"^\d{6}$")
    return_city: Optional[str] = Field(default=None, max_length=80)
    return_state: str = Field(..., min_length=1, max_length=80)
    return_country: str = Field(default="India", max_length=80)


class DelhiveryTestRequest(BaseModel):
    pincode: str = Field(default="110001", min_length=6, max_length=6, pattern=r"^\d{6}$")


class DelhiveryRateRequest(BaseModel):
    deliveryPincode: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    weight: int = Field(default=500, ge=50, le=50000)
    paymentMode: str = Field(default="Prepaid")
    codAmount: float = Field(default=0, ge=0)
    shipmentValue: float = Field(default=0, ge=0)
    length: float = Field(default=10, ge=1, le=200)
    breadth: float = Field(default=10, ge=1, le=200)
    height: float = Field(default=10, ge=1, le=200)


class CreateDelhiveryShipmentRequest(BaseModel):
    orderId: str = Field(..., min_length=1)
    weightGrams: int | None = Field(default=None, ge=50, le=50000)
    markShipped: bool = True


class DelhiveryPickupRequest(BaseModel):
    shipmentIds: list[str] = Field(default_factory=list, max_length=100)
    pickupDate: str | None = Field(
        default=None,
        description="YYYY-MM-DD; defaults to today (IST-friendly local date)",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    pickupTime: str | None = Field(
        default=None,
        description="HH:MM:SS; defaults to 18:00:00",
        pattern=r"^\d{2}:\d{2}:\d{2}$",
    )
