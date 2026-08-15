import { useQuery } from "@tanstack/react-query";
import { searchProducts } from "../api/product.api";
import type { ProductSearchRequest } from "../types";
export const useSearchProducts = (
  payload: ProductSearchRequest,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["search-products", payload],
    queryFn: () => searchProducts(payload),
    enabled,
    select: (response) => response.data,
  });
};
