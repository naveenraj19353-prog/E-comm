from pydantic import BaseModel, Field, StrictStr
from typing import Any, Dict, List, Literal, Optional

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
    # Tax as charged on this line, snapshotted at order time.
    hsnCode: Optional[str] = None
    gstRate: Optional[float] = None
    taxableValue: Optional[float] = None
    taxAmount: Optional[float] = None


class OrderTax(BaseModel):
    """The tax block stored on an order: a snapshot, never recomputed."""

    taxInclusive: bool = True
    compositionScheme: bool = False
    interState: bool = False
    placeOfSupply: Optional[str] = None
    sellerStateCode: Optional[str] = None
    shippingTaxable: bool = False
    shippingTax: float = 0.0
    taxableValue: float = 0.0
    totalTax: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    cess: float = 0.0
    roundOff: float = 0.0
    grandTotal: float = 0.0
    rateWise: List[Dict[str, Any]] = Field(default_factory=list)
    lines: List[Dict[str, Any]] = Field(default_factory=list)


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
    # Optional so existing clients keep working; the store recomputes server-side.
    tax: Optional[OrderTax] = None


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
