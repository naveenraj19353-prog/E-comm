import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { ProductQueryParams, ProductSearchRequest, ProductsResponse, } from "../types";
export const getProducts = async (params: ProductQueryParams): Promise<ProductsResponse> => {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.GET_ALL, {
        params,
        paramsSerializer: { indexes: null },
    });
    return response.data;
};
export const searchProducts = async (payload: ProductSearchRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.PRODUCT.SEARCH, payload);
    return response.data;
};
export const getCategory = async (tenantId: string) => {
    const response = await apiClient.get(API_ENDPOINTS.CATEGORIES.LIST, {
        params: {
            tenantId,
        },
    });
    return response.data;
};
export interface AddCartRequest {
    tenantId: string;
    userId: string;
    productId: string;
    quantity: number;
}
export const addToCart = async (payload: AddCartRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.CART.ADD, payload);
    return response.data;
};
export interface AddWishlistRequest {
    tenantId: string;
    userId: string;
    productId: string;
}
export const addToWishlist = async (payload: AddWishlistRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.WISHLIST.ADD, payload);
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
export const getWishlist = async (userId: string, tenantId: string) => {
    const response = await apiClient.get(API_ENDPOINTS.WISHLIST.byUserId(userId), {
        params: { tenantId },
    });
    return response.data;
};
export const getCart = async (userId: string, tenantId: string) => {
    const response = await apiClient.get(API_ENDPOINTS.CART.byUserId(userId), {
        params: { tenantId },
    });
    return response.data;
};
export interface UpdateCartRequest {
    tenantId: string;
    userId: string;
    quantity: number;
}
export const updateCartQuantity = async (productId: string, payload: UpdateCartRequest) => {
    const response = await apiClient.put(API_ENDPOINTS.CART.byProductId(productId), payload);
    return response.data;
};
export const removeFromCart = async (productId: string, userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.CART.byProductId(productId), {
        params: { userId, tenantId },
    });
    return response.data;
};
export const clearCart = async (userId: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.CART.CLEAR, {
        params: { userId, tenantId },
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
export const getProductDetails = async (productId: string, tenantId: string) => {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.byId(productId), {
        params: {
            tenantId,
        },
    });
    return response.data;
};
