import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../../services/productService";

export const useProducts = (
  tenantId: string,
) => {
  return useQuery({
    queryKey: ["products", tenantId],

    queryFn: () =>
      getProducts(tenantId),

    staleTime: 1000 * 60 * 5,
  });
};