from pydantic import BaseModel, Field, StrictStr
from typing import List, Literal, Optional

OrderStatus = Literal[
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "delivered",
    "cancelled",
    "open",
    "closed",
    "return_requested",
    "return_approved",
    "returned",
    "refunded",
    "partially_returned",
    "partially_refunded",
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


class ReturnItemSelection(BaseModel):
    productId: StrictStr
    variantId: Optional[StrictStr] = None
    quantity: int = Field(gt=0, le=1000)


class RequestReturn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    # Omitted means the whole order, so older clients keep working.
    items: Optional[List[ReturnItemSelection]] = Field(default=None, max_length=200)


class RejectReturn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
