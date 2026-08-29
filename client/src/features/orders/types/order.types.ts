export type OrderStatus =
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled";

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
    orderStatus?: OrderStatus;
    address?: OrderAddress | null;
    addressId?: string | null;
    customer?: OrderCustomer;
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
