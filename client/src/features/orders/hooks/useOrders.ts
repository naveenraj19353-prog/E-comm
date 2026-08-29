import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getAdminOrderDetail,
    getAdminOrders,
    getOrderDetail,
    getUserOrders,
    updateAdminOrderStatus,
} from "../api/order.api";
import type { OrderStatus } from "../types/order.types";

export const useUserOrders = (userId: string) => {
    return useQuery({
        queryKey: ["orders", "user", userId],
        queryFn: () => getUserOrders(userId),
        enabled: Boolean(userId),
    });
};

export const useOrderDetail = (orderId: string) => {
    return useQuery({
        queryKey: ["orders", "detail", orderId],
        queryFn: () => getOrderDetail(orderId),
        enabled: Boolean(orderId),
    });
};

export const useAdminOrderDetail = (orderId: string, tenantId: string) => {
    return useQuery({
        queryKey: ["orders", "admin", "detail", tenantId, orderId],
        queryFn: () => getAdminOrderDetail(orderId, tenantId),
        enabled: Boolean(orderId && tenantId),
    });
};

export const useAdminOrders = (tenantId: string) => {
    const queryClient = useQueryClient();
    const ordersQuery = useQuery({
        queryKey: ["orders", "admin", tenantId],
        queryFn: () => getAdminOrders(tenantId),
        enabled: Boolean(tenantId),
    });

    const statusMutation = useMutation({
        mutationFn: ({
            orderId,
            orderStatus,
        }: {
            orderId: string;
            orderStatus: OrderStatus;
        }) => updateAdminOrderStatus(orderId, tenantId, { orderStatus }),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["orders", "admin", tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: ["orders", "admin", "detail", tenantId],
            });
        },
    });

    return {
        ...ordersQuery,
        updateOrderStatus: statusMutation.mutateAsync,
        isUpdatingStatus: statusMutation.isPending,
    };
};
