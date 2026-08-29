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

export const orderStatusLabel: Record<OrderStatus, string> = {
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
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

export const formatOrderAmount = (value: number): string =>
    `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
