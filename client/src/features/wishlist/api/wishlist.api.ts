import apiClient from "../../../api/client";
import type { WishlistResponse } from "../types";
export interface AddToWishlistRequest {
  tenantId: string;
  userId: string;
  productId: string;
}
export const addToWishlist = async (payload: AddToWishlistRequest) => {
  const response = await apiClient.post("/wishlist/", payload);
  return response.data;
};
export const getWishlist = async (
  userId: string,
  tenantId: string,
): Promise<WishlistResponse> => {
  const response = await apiClient.get(`/wishlist/${userId}`, {
    params: {
      tenantId,
    },
  });
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
export const clearWishlist = async (userId: string, tenantId: string) => {
  const response = await apiClient.delete("/wishlist/", {
    params: {
      userId,
      tenantId,
    },
  });
  return response.data;
};
