import { useMutation } from "@tanstack/react-query";
import { createPaymentOrder, verifyPayment } from "../api/payment.api";
export const usePayment = () => {
    const createOrderMutation = useMutation({
        mutationFn: createPaymentOrder,
    });
    const verifyPaymentMutation = useMutation({
        mutationFn: verifyPayment,
    });
    return {
        createOrder: createOrderMutation.mutateAsync,
        verifyPayment: verifyPaymentMutation.mutateAsync,
        isCreatingOrder: createOrderMutation.isPending,
        isVerifyingPayment: verifyPaymentMutation.isPending,
    };
};
