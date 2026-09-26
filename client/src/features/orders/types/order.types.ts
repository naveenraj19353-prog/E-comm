export type OrderStatus =
    | "confirmed"
    | "processing"
    | "packed"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "open"
    | "closed"
    | "return_requested"
    | "return_approved"
    | "returned"
    | "refunded"
    | "partially_returned"
    | "partially_refunded";

export type ReturnStatus =
    | "requested"
    | "approved"
    | "rejected"
    | "received"
    | "refunded";

export interface OrderItem {
    productId: string;
    variantId?: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
    image?: string;
    color?: string;
    size?: string;
}

export interface OrderAddress {
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}

export interface OrderCustomer {
    name?: string;
    email?: string;
}

export interface OrderCourier {
    provider?: string;
    waybill?: string;
    trackingUrl?: string;
    labelUrl?: string;
    pickupLocation?: string;
    shippedAt?: string;
    trackingStatus?: string;
}

export interface ReturnItem {
    productId: string;
    variantId?: string | null;
    name?: string;
    price?: number;
    quantity: number;
}

export interface ReturnItemSelection {
    productId: string;
    variantId?: string | null;
    quantity: number;
}

export interface OrderReturnRequest {
    status: ReturnStatus;
    reason?: string;
    items?: ReturnItem[];
    partial?: boolean;
    refundAmount?: number;
    rejectReason?: string;
    requestedAt?: string;
    approvedAt?: string;
    rejectedAt?: string;
    receivedAt?: string;
    refundedAt?: string;
    refundId?: string;
    refundStatus?: string;
    refundNote?: string;
    reverseAwb?: string;
    reverseTrackingUrl?: string;
    reverseNote?: string;
    stockRestored?: boolean;
    windowDays?: number;
}

export interface Order {
    orderId: string;
    orderNumber?: number | null;
    orderRef?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    items: OrderItem[];
    subtotal: number;
    discount?: number;
    shipping?: number;
    totalAmount: number;
    refundedAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
    deliveryMethod?: string;
    orderStatus?: OrderStatus;
    channel?: string;
    counterNumber?: string;
    phone?: string;
    paidAt?: string;
    address?: OrderAddress | null;
    addressId?: string | null;
    customer?: OrderCustomer;
    courier?: OrderCourier | null;
    deliveredAt?: string;
    packedAt?: string | null;
    /** Admin order detail only: who marked it packed. */
    packedBy?: string | null;
    returnRequest?: OrderReturnRequest | null;
    canRequestReturn?: boolean;
    createdAt?: string;
    updatedAt?: string;
    codHandlingCharge?: number;
}
export interface OrdersResponse {
    success: boolean;
    count: number;
    data: Order[];
}

export interface AdminOrdersResponse extends OrdersResponse {
    total: number;
    page: number;
    pageSize: number;
    statusCounts?: Record<string, number>;
}

export interface AdminOrdersPage {
    orders: Order[];
    total: number;
    page: number;
    pageSize: number;
    statusCounts: Record<string, number>;
}

export interface AdminOrdersParams {
    page?: number;
    pageSize?: number;
    status?: string;
    /** Order ref (RC-10023), customer name/email/phone or address name/phone. */
    search?: string;
    /** Inclusive dates, YYYY-MM-DD. */
    from?: string;
    to?: string;
    /** Only this customer's orders (customer history). */
    customerId?: string;
}

export interface OrderResponse {
    success: boolean;
    order: Order;
}

export interface UpdateOrderStatusPayload {
    orderStatus: OrderStatus;
}
