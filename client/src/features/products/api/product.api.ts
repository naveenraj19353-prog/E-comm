import apiClient from "../../../api/client";
import type {
  ProductQueryParams,
  ProductSearchRequest,
  ProductsResponse,
} from "../types";
export const getProducts = async (
  params: ProductQueryParams,
): Promise<ProductsResponse> => {
  const response = await apiClient.get("/product/get-all-products", {
    params,
    paramsSerializer: { indexes: null },
  });
  return response.data;
};
export const searchProducts = async (payload: ProductSearchRequest) => {
  const response = await apiClient.post("/product/search", payload);
  return response.data;
};
export const getCategory = async (tenantId: string) => {
  const response = await apiClient.get("/categories", {
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
  const response = await apiClient.post("/cart/", payload);
  return response.data;
};
export interface AddWishlistRequest {
  tenantId: string;
  userId: string;
  productId: string;
}
export const addToWishlist = async (payload: AddWishlistRequest) => {
  const response = await apiClient.post("/wishlist/", payload);
  return response.data;
};
export const removeFromWishlist = async (
  productId: string,
  userId: string,
  tenantId: string,
) => {
  const response = await apiClient.delete(`/wishlist/${productId}`, {
    params: {
      userId,
      tenantId,
    },
  });
  return response.data;
};
export const getWishlist = async (userId: string, tenantId: string) => {
  const response = await apiClient.get(`/wishlist/${userId}`, {
    params: { tenantId },
  });
  return response.data;
};
export const getCart = async (userId: string, tenantId: string) => {
  const response = await apiClient.get(`/cart/${userId}`, {
    params: { tenantId },
  });
  return response.data;
};
export interface UpdateCartRequest {
  tenantId: string;
  userId: string;
  quantity: number;
}
export const updateCartQuantity = async (
  productId: string,
  payload: UpdateCartRequest,
) => {
  const response = await apiClient.put(`/cart/${productId}`, payload);
  return response.data;
};
export const removeFromCart = async (
  productId: string,
  userId: string,
  tenantId: string,
) => {
  const response = await apiClient.delete(`/cart/${productId}`, {
    params: { userId, tenantId },
  });
  return response.data;
};
export const clearCart = async (userId: string, tenantId: string) => {
  const response = await apiClient.delete("/cart/", {
    params: { userId, tenantId },
  });
  return response.data;
};
export const updateCart = async (
  productId: string,
  userId: string,
  tenantId: string,
  quantity: number,
) => {
  const response = await apiClient.put(`/cart/${productId}`, {
    userId,
    tenantId,
    quantity,
  });
  return response.data;
};
export const getProductDetails = async (
  productId: string,
  tenantId: string,
) => {
  const response = await apiClient.get(`/product/${productId}`, {
    params: {
      tenantId,
    },
  });
  return response.data;
};
