import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { WishlistResponse } from "../types";
export interface AddToWishlistRequest {
    tenantId: string;
    userId: string;
    productId: string;
}
export const addToWishlist = async (payload: AddToWishlistRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.WISHLIST.ADD, payload);
    return response.data;
};
export const getWishlist = async (userId: string, tenantId: string): Promise<WishlistResponse> => {
    const response = await apiClient.get(API_ENDPOINTS.WISHLIST.byUserId(userId), {
        params: {
            tenantId,
        },
    });
    return response.data;
};
export const removeFromWishlist = async (productId: string, userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.WISHLIST.byProductId(productId), {
        params: {
            userId,
            tenantId,
        },
    });
    return response.data;
};
export const clearWishlist = async (userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.WISHLIST.CLEAR, {
        params: {
            userId,
            tenantId,
        },
    });
    return response.data;
};
