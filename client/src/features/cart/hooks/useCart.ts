import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCart,
} from "../api/cart.api";
import type { AddToCartRequest, CartResponse } from "../types";
export const useCart = (userId: string, tenantId: string) => {
  const queryClient = useQueryClient();
  const cartQuery = useQuery<CartResponse>({
    queryKey: ["cart", userId, tenantId],
    queryFn: () => getCart(userId, tenantId),
    enabled: Boolean(userId) && Boolean(tenantId),
  });
  const addMutation = useMutation({
    mutationFn: (payload: AddToCartRequest) => addToCart(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cart", userId, tenantId],
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity: number;
    }) => updateCart(productId, userId, tenantId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cart", userId, tenantId],
      });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (productId: string) =>
      removeFromCart(productId, userId, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cart", userId, tenantId],
      });
    },
  });
  const clearMutation = useMutation({
    mutationFn: () => clearCart(userId, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cart", userId, tenantId],
      });
    },
  });
  return {
    cart: cartQuery.data?.data ?? [],
    grandTotal: cartQuery.data?.grandTotal ?? 0,
    cartCount: cartQuery.data?.count ?? 0,
    isLoading: cartQuery.isLoading,
    isError: cartQuery.isError,
    error: cartQuery.error,
    refetch: cartQuery.refetch,
    addToCart: addMutation.mutateAsync,
    updateCart: updateMutation.mutateAsync,
    removeFromCart: removeMutation.mutateAsync,
    clearCart: () => clearMutation.mutateAsync(),
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isClearing: clearMutation.isPending,
  };
};
