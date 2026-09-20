import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../api/product.api";
import type { Product } from "../types";

const SIMILAR_LIMIT = 8;

export const useSimilarProducts = (
    tenantId: string,
    productId: string,
    categoryId?: string,
) => {
    return useQuery({
        queryKey: ["similar-products", tenantId, productId, categoryId ?? ""],
        queryFn: async (): Promise<Product[]> => {
            const load = async (categoryIds?: string[]) => {
                const response = await getProducts({
                    tenantId,
                    categoryIds,
                    page: 1,
                    limit: SIMILAR_LIMIT + 1,
                    sortBy: "createdAt",
                    sortOrder: "desc",
                });
                return (response.data ?? []).filter((item) => item._id !== productId);
            };

            let products = await load(categoryId ? [categoryId] : undefined);
            if (products.length === 0 && categoryId) {
                products = await load(undefined);
            }
            return products.slice(0, SIMILAR_LIMIT);
        },
        enabled: Boolean(tenantId && productId),
        staleTime: 30 * 1000,
    });
};
