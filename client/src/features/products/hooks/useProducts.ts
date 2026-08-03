import { useApiQuery } from "../../../hooks/useApiQuery";
import { getProducts } from "../api/product.api";

export const useProducts = (tenantId: string) =>
  useApiQuery(["products", tenantId], () => getProducts(tenantId), {
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
