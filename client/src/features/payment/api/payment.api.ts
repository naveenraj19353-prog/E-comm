import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { DeliveryMethodType } from "../../checkout/api/checkout.api";

export interface CreatePaymentOrderRequest {
    tenantId: string;
    userId: string;
    addressId: string;
    couponCode?: string | null;
    deliveryMethod?: DeliveryMethodType;
}
export interface CreatePaymentOrderResponse {
    success: boolean;
    orderId: string;
    amountInPaise: number;
    currency: string;
}
export interface VerifyPaymentRequest {
    tenantId: string;
    userId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    couponCode?: string | null;
}
export interface VerifyPaymentResponse {
    success: boolean;
    message: string;
    orderId: string;
}
export const createPaymentOrder = async (payload: CreatePaymentOrderRequest): Promise<CreatePaymentOrderResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.CREATE_ORDER, payload);
    return response.data;
};
export const verifyPayment = async (payload: VerifyPaymentRequest): Promise<VerifyPaymentResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.VERIFY, payload);
    return response.data;
};
