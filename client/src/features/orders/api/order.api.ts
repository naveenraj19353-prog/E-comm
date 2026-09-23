import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type {
    Order,
    OrderResponse,
    OrdersResponse,
    OrderStatus,
    UpdateOrderStatusPayload,
} from "../types/order.types";

export const getUserOrders = async (userId: string): Promise<Order[]> => {
    const response = await apiClient.get<OrdersResponse>(API_ENDPOINTS.ORDERS.byUserId(userId));
    return response.data?.data ?? [];
};

export const getOrderDetail = async (orderId: string): Promise<Order> => {
    const response = await apiClient.get<OrderResponse>(API_ENDPOINTS.ORDERS.detail(orderId));
    if (!response.data?.order) {
        throw new Error("Order not found.");
    }
    return response.data.order;
};

export const getAdminOrderDetail = async (
    orderId: string,
    tenantId: string,
): Promise<Order> => {
    const response = await apiClient.get<OrderResponse>(API_ENDPOINTS.ORDERS.adminDetail(orderId), {
        params: { tenantId },
    });
    if (!response.data?.order) {
        throw new Error("Order not found.");
    }
    return response.data.order;
};

export const getAdminOrders = async (tenantId: string): Promise<Order[]> => {
    const response = await apiClient.get<OrdersResponse>(API_ENDPOINTS.ORDERS.ADMIN_LIST, {
        params: { tenantId },
    });
    return response.data?.data ?? [];
};

export const updateAdminOrderStatus = async (
    orderId: string,
    tenantId: string,
    payload: UpdateOrderStatusPayload,
): Promise<Order> => {
    const response = await apiClient.patch<{ success: boolean; order: Order }>(
        API_ENDPOINTS.ORDERS.adminStatus(orderId),
        payload,
        { params: { tenantId } },
    );
    if (!response.data?.order) {
        throw new Error("Unable to update order status.");
    }
    return response.data.order;
};

const unwrapOrder = (order: Order | undefined, fallback: string): Order => {
    if (!order) {
        throw new Error(fallback);
    }
    return order;
};

export const requestOrderReturn = async (
    orderId: string,
    reason: string,
): Promise<Order> => {
    const response = await apiClient.post<OrderResponse>(
        API_ENDPOINTS.ORDERS.requestReturn(orderId),
        { reason },
    );
    return unwrapOrder(response.data?.order, "Unable to request a return.");
};

export const approveAdminReturn = async (
    orderId: string,
    tenantId: string,
): Promise<Order> => {
    const response = await apiClient.post<{ success: boolean; order: Order }>(
        API_ENDPOINTS.ORDERS.adminReturnApprove(orderId),
        {},
        { params: { tenantId } },
    );
    return unwrapOrder(response.data?.order, "Unable to approve the return.");
};

export const rejectAdminReturn = async (
    orderId: string,
    tenantId: string,
    reason: string,
): Promise<Order> => {
    const response = await apiClient.post<{ success: boolean; order: Order }>(
        API_ENDPOINTS.ORDERS.adminReturnReject(orderId),
        { reason },
        { params: { tenantId } },
    );
    return unwrapOrder(response.data?.order, "Unable to reject the return.");
};

export const markAdminReturnReceived = async (
    orderId: string,
    tenantId: string,
): Promise<Order> => {
    const response = await apiClient.post<{ success: boolean; order: Order }>(
        API_ENDPOINTS.ORDERS.adminReturnReceived(orderId),
        {},
        { params: { tenantId } },
    );
    return unwrapOrder(response.data?.order, "Unable to mark the return received.");
};

export const refundAdminReturn = async (
    orderId: string,
    tenantId: string,
): Promise<Order> => {
    const response = await apiClient.post<{ success: boolean; order: Order }>(
        API_ENDPOINTS.ORDERS.adminReturnRefund(orderId),
        {},
        { params: { tenantId } },
    );
    return unwrapOrder(response.data?.order, "Unable to issue the refund.");
};

export const orderStatusLabel: Record<OrderStatus, string> = {
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
    open: "Open",
    closed: "Closed",
    return_requested: "Return requested",
    return_approved: "Return approved",
    returned: "Returned",
    refunded: "Refunded",
};

export const formatOrderDate = (value?: string): string => {
    if (!value) {
        return "-";
    }
    return new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
};

export const formatOrderAmount = (value?: number): string => {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(value || 0);
};
