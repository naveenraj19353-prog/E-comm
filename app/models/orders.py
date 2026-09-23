from pydantic import BaseModel, Field, StrictStr
from typing import List, Literal, Optional

OrderStatus = Literal[
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "open",
    "closed",
    "return_requested",
    "return_approved",
    "returned",
    "refunded",
]


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


class UpdateOrderStatus(BaseModel):
    orderStatus: OrderStatus


class RequestReturn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class RejectReturn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
