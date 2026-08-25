import { useInfiniteQuery } from "@tanstack/react-query";
import { getProducts } from "../api/product.api";
import type { ProductQueryParams } from "../types";
export const useProducts = (params: Omit<ProductQueryParams, "page">) => {
    return useInfiniteQuery({
        queryKey: [
            "products",
            params.tenantId,
            params.categoryIds ?? [],
            params.colors ?? [],
            params.sizes ?? [],
            params.brands ?? [],
            params.minPrice ?? null,
            params.maxPrice ?? null,
            params.rating ?? null,
            params.search ?? "",
            params.sortBy ?? "createdAt",
            params.sortOrder ?? "desc",
            params.limit ?? 20,
        ],
        initialPageParam: 1,
        queryFn: ({ pageParam }) => {
            console.log("🔥 PRODUCTS API QUERY:", {
                ...params,
                page: pageParam,
            });
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
