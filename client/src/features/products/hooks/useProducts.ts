import { useInfiniteQuery } from "@tanstack/react-query";
import { getProducts } from "../api/product.api";
import type { ProductQueryParams } from "../types";
export const useProducts = (params: Omit<ProductQueryParams, "page">) => {
  return useInfiniteQuery({
    queryKey: ["products", params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      return getProducts({
        ...params,
        page: pageParam,
      });
    },
    enabled: Boolean(params.tenantId),
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasNextPage) {
        return undefined;
      }
      return lastPage.page + 1;
    },
    staleTime: 30 * 1000,
  });
};
