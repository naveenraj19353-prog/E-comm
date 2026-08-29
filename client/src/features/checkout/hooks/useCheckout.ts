import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    placeCodOrder,
    previewCheckout,
    type CheckoutPreviewRequest,
    type DeliveryMethodType,
    type PlaceCodOrderRequest,
} from "../api/checkout.api";

export const useCheckoutPreview = (
    params: CheckoutPreviewRequest & { enabled?: boolean },
) => {
    const { enabled = true, ...request } = params;
    return useQuery({
        queryKey: [
            "checkout-preview",
            request.tenantId,
            request.userId,
            request.addressId,
            request.couponCode,
            request.deliveryMethod,
        ],
        queryFn: () => previewCheckout(request),
        enabled:
            enabled &&
            Boolean(request.tenantId && request.userId),
        retry: false,
    });
};

export const useCheckout = () => {
    const queryClient = useQueryClient();
    const codOrderMutation = useMutation({
        mutationFn: placeCodOrder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cart"] });
            queryClient.invalidateQueries({ queryKey: ["checkout-preview"] });
        },
    });

    return {
        placeCodOrder: codOrderMutation.mutateAsync,
        isPlacingCodOrder: codOrderMutation.isPending,
    };
};

export type { DeliveryMethodType, PlaceCodOrderRequest };
