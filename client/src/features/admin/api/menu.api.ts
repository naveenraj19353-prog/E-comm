import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { Order } from "../../orders/types/order.types";

export type DailyPasswordStatus = {
    success: boolean;
    isSet: boolean;
    expiresAt?: string | null;
    updatedAt?: string | null;
    validForHours?: number;
    validDate?: string;
    password?: string;
    message?: string;
};

export type MenuCartItem = {
    productId: string;
    variantId?: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
};

export type MenuCart = {
    userId: string;
    phone: string;
    name: string;
    counterNumber: string;
    itemCount: number;
    subtotal: number;
    totalAmount: number;
    items: MenuCartItem[];
    updatedAt?: string | null;
};

export const getMenuDailyPassword = async (
    tenantId: string,
): Promise<DailyPasswordStatus> => {
    const response = await apiClient.get(API_ENDPOINTS.MENU.DAILY_PASSWORD, {
        params: { tenantId },
    });
    return response.data;
};

export const rotateMenuDailyPassword = async (
    tenantId: string,
): Promise<DailyPasswordStatus> => {
    const response = await apiClient.post(
        API_ENDPOINTS.MENU.ROTATE_DAILY_PASSWORD,
        null,
        { params: { tenantId } },
    );
    return response.data;
};

export const getMenuCarts = async (
    tenantId: string,
): Promise<{ success: boolean; count: number; data: MenuCart[] }> => {
    const response = await apiClient.get(API_ENDPOINTS.MENU.CARTS, {
        params: { tenantId },
    });
    return response.data;
};

export const markMenuCartPaymentDone = async (
    userId: string,
    tenantId: string,
): Promise<{ success: boolean; message?: string; order: Order }> => {
    const response = await apiClient.post(
        API_ENDPOINTS.MENU.cartPaymentDone(userId),
        null,
        { params: { tenantId } },
    );
    return response.data;
};

export const markMenuPaymentDone = async (
    orderId: string,
    tenantId: string,
): Promise<{ success: boolean; message?: string; order: Order }> => {
    const response = await apiClient.post(
        API_ENDPOINTS.MENU.paymentDone(orderId),
        null,
        { params: { tenantId } },
    );
    return response.data;
};
