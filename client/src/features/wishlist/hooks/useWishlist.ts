import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { RootState } from "../../../app/store";
import { addToWishlist, clearWishlist, getWishlist, removeFromWishlist, } from "../api/wishlist.api";
import type { AddToWishlistRequest } from "../api/wishlist.api";

export const useWishlist = (
    userId?: string | null,
    tenantId?: string | null,
    options?: { enabled?: boolean },
) => {
    const queryClient = useQueryClient();
    const auth = useSelector((state: RootState) => state.auth);
    const isCustomer =
        auth.isAuthenticated &&
        auth.user?.role === "customer" &&
        Boolean(auth.user?._id);
    const resolvedUserId = (userId ?? auth.user?._id ?? "").trim();
    const resolvedTenantId = (tenantId || auth.user?.tenantId || "").trim();
    const enabled =
        (options?.enabled ?? true) &&
        isCustomer &&
        Boolean(resolvedUserId) &&
        Boolean(resolvedTenantId);

    const wishlistQuery = useQuery({
        queryKey: ["wishlist", resolvedUserId, resolvedTenantId],
        queryFn: () => getWishlist(resolvedUserId, resolvedTenantId),
        enabled,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const addMutation = useMutation({
        mutationFn: (payload: AddToWishlistRequest) => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return addToWishlist(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["wishlist", resolvedUserId, resolvedTenantId],
            });
        },
    });
    const removeMutation = useMutation({
        mutationFn: (productId: string) => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return removeFromWishlist(productId, resolvedUserId, resolvedTenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["wishlist", resolvedUserId, resolvedTenantId],
            });
        },
    });
    const clearMutation = useMutation({
        mutationFn: () => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return clearWishlist(resolvedUserId, resolvedTenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["wishlist", resolvedUserId, resolvedTenantId],
            });
        },
    });
    return {
        wishlist: enabled ? (wishlistQuery.data?.data ?? []) : [],
        wishlistCount: enabled ? (wishlistQuery.data?.count ?? 0) : 0,
        isLoading: enabled && wishlistQuery.isLoading,
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
