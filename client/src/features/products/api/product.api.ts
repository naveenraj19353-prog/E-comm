import apiClient from "../../../api/client";

export const getProducts = async (tenantId: string) => {
  const response = await apiClient.get("/product/get-all-products", {
    params: {
      tenantId,
    },
  });

  return response.data;
};

export const getCategory = async (tenantId: string) => {
  const response = await apiClient.get("/categories/", {
    params: {
      tenantId,
    },
  });

  return response.data;
};