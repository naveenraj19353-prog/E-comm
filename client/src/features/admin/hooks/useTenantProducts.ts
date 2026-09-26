import { useInfiniteQuery, useMutation, useQueryClient, } from "@tanstack/react-query";
import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import { QUERY_KEYS } from "../../../constants/queryKeys";
import type { ProductQueryParams, ProductsResponse } from "../types/types";
export interface ProductInventoryPayload {
    variantId: string;
    color: string;
    size: string;
    stock: number;
}
export interface CreateProductPayload {
    tenantId: string;
    name: string;
    description: string;
    categoryId: string;
    brand?: string;
    location?: string;
    foodType?: "veg" | "non_veg";
    basePrice?: number;
    marginPercentage?: number;
    price: number;
    discountPercentage: number;
    finalPrice?: number;
    stock?: number;
    /** HSN/SAC code (4, 6 or 8 digits) and GST rate. Unset falls back to the
     * category's rate, then the store's default. */
    hsnCode?: string;
    gstRate?: number | null;
    sizes: string[];
    colors: string[];
    inventory: ProductInventoryPayload[];
    images: Record<string, string[]>;
    /** Save without publishing (hidden from the storefront). */
    isDraft?: boolean;
}
export interface UpdateProductPayload {
    tenantId: string;
    name: string;
    description: string;
    categoryId: string;
    brand?: string;
    location?: string;
    foodType?: "veg" | "non_veg";
    price: number;
    discountPercentage: number;
    stock?: number;
    /** HSN/SAC code and GST rate; see CreateProductPayload. */
    hsnCode?: string;
    gstRate?: number | null;
    sizes?: string[];
    colors?: string[];
    inventory?: ProductInventoryPayload[];
    images: Record<string, string[]>;
    isActive: boolean;
}
interface DeleteProductPayload {
    productId: string;
    tenantId: string;
}
interface UpdateProductMutationPayload {
    productId: string;
    payload: UpdateProductPayload;
}
const getProducts = async (params: ProductQueryParams): Promise<ProductsResponse> => {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.GET_ALL, {
        params,
        paramsSerializer: {
            indexes: null,
        },
    });
    return response.data;
};
export const useProducts = (params: ProductQueryParams) => {
    return useInfiniteQuery({
        queryKey: [
            "admin-products",
            params.tenantId,
            params.search,
            params.categoryIds,
            params.minPrice,
            params.maxPrice,
            params.sizes,
            params.colors,
            params.rating,
            params.sortBy,
            params.sortOrder,
        ],
        queryFn: ({ pageParam }) => getProducts({
            ...params,
            page: pageParam,
        }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            if (!lastPage.hasNextPage) {
                return undefined;
            }
            return lastPage.page + 1;
        },
        enabled: Boolean(params.tenantId),
    });
};
export const useCreateProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: CreateProductPayload) => {
            const response = await apiClient.post(API_ENDPOINTS.PRODUCT.CREATE, payload);
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["admin-products", variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: ["tenant-products", variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.CATEGORIES, variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.PRODUCTS],
            });
        },
    });
};
export const useUpdateProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, payload, }: UpdateProductMutationPayload) => {
            const response = await apiClient.put(API_ENDPOINTS.PRODUCT.byId(productId), payload);
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["admin-products", variables.payload.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: ["tenant-products", variables.payload.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.CATEGORIES, variables.payload.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.PRODUCTS],
            });
        },
    });
};
export const useDeleteProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, tenantId }: DeleteProductPayload) => {
            const response = await apiClient.delete(API_ENDPOINTS.PRODUCT.byId(productId), {
                params: {
                    tenantId,
                },
            });
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["admin-products", variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: ["tenant-products", variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.CATEGORIES, variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: [QUERY_KEYS.PRODUCTS],
            });
        },
    });
};
