import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../api/product.api";

export const useProducts = (tenantId: string) => {
  return useQuery({
    queryKey: ["products", tenantId],
    queryFn: () => getProducts(tenantId),
    enabled: !!tenantId,
    select: (response) => response.data,
  });
};