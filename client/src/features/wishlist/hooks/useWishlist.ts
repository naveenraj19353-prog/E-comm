import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addToWishlist,
  clearWishlist,
  getWishlist,
  removeFromWishlist,
} from "../api/wishlist.api";

import type { AddToWishlistRequest } from "../api/wishlist.api";

export const useWishlist = (
  userId: string,
  tenantId: string,
) => {
  const queryClient = useQueryClient();

  const wishlistQuery = useQuery({
    queryKey: ["wishlist", userId, tenantId],
    queryFn: () => getWishlist(userId, tenantId),
    enabled: Boolean(userId && tenantId),
  });

  const addMutation = useMutation({
    mutationFn: (payload: AddToWishlistRequest) =>
      addToWishlist(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wishlist", userId, tenantId],
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) =>
      removeFromWishlist(productId, userId, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wishlist", userId, tenantId],
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      clearWishlist(userId, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wishlist", userId, tenantId],
      });
    },
  });

  return {
    wishlist: wishlistQuery.data?.data ?? [],
    wishlistCount: wishlistQuery.data?.count ?? 0,

    isLoading: wishlistQuery.isLoading,
    isError: wishlistQuery.isError,
    error: wishlistQuery.error,

    refetch: wishlistQuery.refetch,

    addToWishlist: addMutation.mutateAsync,
    removeFromWishlist: removeMutation.mutateAsync,
    clearWishlist: () => clearMutation.mutateAsync(),

    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    isClearing: clearMutation.isPending,
  };
};