export type OrderStatus =
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "open"
    | "closed";

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

export interface Order {
    orderId: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    items: OrderItem[];
    subtotal: number;
    discount?: number;
    shipping?: number;
    totalAmount: number;
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
    createdAt?: string;
    updatedAt?: string;
}
export interface OrdersResponse {
    success: boolean;
    count: number;
    data: Order[];
}

export interface OrderResponse {
    success: boolean;
    order: Order;
}

export interface UpdateOrderStatusPayload {
    orderStatus: OrderStatus;
}
