import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import apiClient from "../../../api/client";
import type { ProductQueryParams, ProductsResponse } from "../types/type";
export interface CreateProductPayload {
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  discountPercentage: number;
  stock: number;
  sizes: string[];
  colors: string[];
  images: string[];
}
export interface UpdateProductPayload {
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  discountPercentage: number;
  stock: number;
  sizes: string[];
  colors: string[];
  images: string[];
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
const getProducts = async (
  params: ProductQueryParams,
): Promise<ProductsResponse> => {
  const response = await apiClient.get("/product/get-all-products", {
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
    queryFn: ({ pageParam }) =>
      getProducts({
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
      const response = await apiClient.post("/product/create-product", payload);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-products", variables.tenantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tenant-products", variables.tenantId],
      });
    },
  });
};
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      payload,
    }: UpdateProductMutationPayload) => {
      const response = await apiClient.put(`/product/${productId}`, payload);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-products", variables.payload.tenantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tenant-products", variables.payload.tenantId],
      });
    },
  });
};
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, tenantId }: DeleteProductPayload) => {
      const response = await apiClient.delete(`/product/${productId}`, {
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
    },
  });
};
