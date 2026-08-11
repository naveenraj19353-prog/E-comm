import apiClient from "../../../api/client";

import type { AddToCartRequest } from "../types";

export const addToCart = async (payload: AddToCartRequest) => {
  const response = await apiClient.post("/cart/", payload);

  return response.data;
};

export const getCart = async (userId: string, tenantId: string) => {
  const response = await apiClient.get(`/cart/${userId}`, {
    params: {
      tenantId,
    },
  });

  return response.data;
};

export const updateCart = async (
  productId: string,
  userId: string,
  tenantId: string,
  quantity: number
) => {
  const response = await apiClient.put(`/cart/${productId}`, {
    userId,
    tenantId,
    quantity,
  });

  return response.data;
};

export const removeFromCart = async (
  productId: string,
  userId: string,
  tenantId: string
) => {
  const response = await apiClient.delete(`/cart/${productId}`, {
    params: {
      userId,
      tenantId,
    },
  });

  return response.data;
};

export const clearCart = async (userId: string, tenantId: string) => {
  const response = await apiClient.delete("/cart/", {
    params: {
      userId,
      tenantId,
    },
  });

  return response.data;
};
