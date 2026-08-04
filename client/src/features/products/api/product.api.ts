import apiClient from "../../../api/client";
import type { ProductSearchRequest } from "../types";

// Get All Products
export const getProducts = async (tenantId: string) => {
  const response = await apiClient.get("/product/get-all-products", {
    params: {
      tenantId,
    },
  });

  return response.data;
};

// Search Products
export const searchProducts = async (
  payload: ProductSearchRequest
) => {
  const response = await apiClient.post(
    "/product/search",
    payload
  );

  return response.data;
};

// Categories
export const getCategory = async (tenantId: string) => {
  const response = await apiClient.get("/categories", {
    params: {
      tenantId,
    },
  });

  return response.data;
};