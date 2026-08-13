from pydantic import BaseModel, Field, StrictStr
from typing import List, Optional


class OrderItem(BaseModel):
    productId: StrictStr
    name: str
    price: float
    quantity: int = Field(gt=0)
    subtotal: float


class CreateOrder(BaseModel):
    tenantId: StrictStr
    userId: StrictStr
    razorpayOrderId: StrictStr
    razorpayPaymentId: StrictStr
    items: List[OrderItem]
    subtotal: float = Field(gt=0)
    totalAmount: float = Field(gt=0)
    addressId: Optional[str] = None
    paymentStatus: str = "paid"
    orderStatus: str = "confirmed"