import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    approveAdminReturn,
    getAdminOrderDetail,
    getAdminOrders,
    getOrderDetail,
    getUserOrders,
    markAdminReturnReceived,
    refundAdminReturn,
    rejectAdminReturn,
    requestOrderReturn,
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

    const invalidate = () => {
        queryClient.invalidateQueries({
            queryKey: ["orders", "admin", tenantId],
        });
        queryClient.invalidateQueries({
            queryKey: ["orders", "admin", "detail", tenantId],
        });
    };

    const statusMutation = useMutation({
        mutationFn: ({
            orderId,
            orderStatus,
        }: {
            orderId: string;
            orderStatus: OrderStatus;
        }) => updateAdminOrderStatus(orderId, tenantId, { orderStatus }),
        onSuccess: invalidate,
    });

    const approveMutation = useMutation({
        mutationFn: (orderId: string) => approveAdminReturn(orderId, tenantId),
        onSuccess: invalidate,
    });

    const rejectMutation = useMutation({
        mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
            rejectAdminReturn(orderId, tenantId, reason),
        onSuccess: invalidate,
    });

    const receivedMutation = useMutation({
        mutationFn: (orderId: string) => markAdminReturnReceived(orderId, tenantId),
        onSuccess: invalidate,
    });

    const refundMutation = useMutation({
        mutationFn: (orderId: string) => refundAdminReturn(orderId, tenantId),
        onSuccess: invalidate,
    });

    return {
        ...ordersQuery,
        updateOrderStatus: statusMutation.mutateAsync,
        isUpdatingStatus: statusMutation.isPending,
        approveReturn: approveMutation.mutateAsync,
        rejectReturn: rejectMutation.mutateAsync,
        markReturnReceived: receivedMutation.mutateAsync,
        issueRefund: refundMutation.mutateAsync,
        isHandlingReturn:
            approveMutation.isPending
            || rejectMutation.isPending
            || receivedMutation.isPending
            || refundMutation.isPending,
    };
};

export const useRequestReturn = (orderId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (reason: string) => requestOrderReturn(orderId, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
    });
};
