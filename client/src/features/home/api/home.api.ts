import apiClient from "../../../api/client";
import type { HomeResponse } from "../types/home.types";

export const getHome = async (
  tenantId: string,
  productLimit = 10,
  categoryLimit = 12
): Promise<HomeResponse> => {
  const response = await apiClient.get<HomeResponse>("/home/", {
    params: {
      tenantId,
      productLimit,
      categoryLimit,
    },
  });

  return response.data;
};
