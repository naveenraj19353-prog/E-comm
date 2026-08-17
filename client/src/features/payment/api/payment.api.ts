import apiClient from "../../../api/client";

export interface CreatePaymentOrderRequest {
  tenantId: string;
  userId: string;
  couponCode?: string | null;
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

export const createPaymentOrder = async (
  payload: CreatePaymentOrderRequest,
): Promise<CreatePaymentOrderResponse> => {
  const response = await apiClient.post(
    "/payments/create-order",
    payload,
  );

  return response.data;
};

export const verifyPayment = async (
  payload: VerifyPaymentRequest,
): Promise<VerifyPaymentResponse> => {
  const response = await apiClient.post(
    "/payments/verify",
    payload,
  );

  return response.data;
};