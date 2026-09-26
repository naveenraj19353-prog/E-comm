import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { RootState } from "../../../app/store";
import { addToCart, clearCart, getCart, removeFromCart, updateCart, } from "../api/cart.api";
import type { AddToCartRequest, CartResponse } from "../types";

export const useCart = (
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

    const cartQuery = useQuery<CartResponse>({
        queryKey: ["cart", resolvedUserId, resolvedTenantId],
        queryFn: () => getCart(resolvedUserId, resolvedTenantId),
        enabled,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const addMutation = useMutation({
        mutationFn: (payload: AddToCartRequest) => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return addToCart(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["cart", resolvedUserId, resolvedTenantId],
            });
        },
    });
    const updateMutation = useMutation({
        mutationFn: ({ productId, quantity, }: {
            productId: string;
            quantity: number;
        }) => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return updateCart(productId, resolvedUserId, resolvedTenantId, quantity);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["cart", resolvedUserId, resolvedTenantId],
            });
        },
    });
    const removeMutation = useMutation({
        mutationFn: (productId: string) => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return removeFromCart(productId, resolvedUserId, resolvedTenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["cart", resolvedUserId, resolvedTenantId],
            });
        },
    });
    const clearMutation = useMutation({
        mutationFn: () => {
            if (!isCustomer) {
                return Promise.reject(new Error("Login required"));
            }
            return clearCart(resolvedUserId, resolvedTenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["cart", resolvedUserId, resolvedTenantId],
            });
        },
    });
    return {
        cart: enabled ? (cartQuery.data?.data ?? []) : [],
        grandTotal: enabled ? (cartQuery.data?.grandTotal ?? 0) : 0,
        tax: enabled ? (cartQuery.data?.tax ?? null) : null,
        cartCount: enabled ? (cartQuery.data?.count ?? 0) : 0,
        isLoading: enabled && cartQuery.isLoading,
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
