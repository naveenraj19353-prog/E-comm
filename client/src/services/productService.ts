import { apiProxy } from "../api/apiProxy";
import { API } from "../api/endpoints";
import type { ProductResponse } from "../types/product";

export const getProducts = (tenantId: string) => {
  return apiProxy.get<ProductResponse>(API.PRODUCTS, {
    tenantId,
  });
};