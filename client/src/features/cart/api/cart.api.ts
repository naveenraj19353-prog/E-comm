import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { AddToCartRequest } from "../types";
export const addToCart = async (payload: AddToCartRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.CART.ADD, payload);
    return response.data;
};
export const getCart = async (userId: string, tenantId: string) => {
    const response = await apiClient.get(API_ENDPOINTS.CART.byUserId(userId), {
        params: {
            tenantId,
        },
    });
    return response.data;
};
export const updateCart = async (productId: string, userId: string, tenantId: string, quantity: number) => {
    const response = await apiClient.put(API_ENDPOINTS.CART.byProductId(productId), {
        userId,
        tenantId,
        quantity,
    });
    return response.data;
};
export const removeFromCart = async (productId: string, userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.CART.byProductId(productId), {
        params: {
            userId,
            tenantId,
        },
    });
    return response.data;
};
export const clearCart = async (userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.CART.CLEAR, {
        params: {
            userId,
            tenantId,
        },
    });
    return response.data;
};
