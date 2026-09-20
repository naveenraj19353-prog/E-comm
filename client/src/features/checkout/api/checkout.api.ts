import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type DeliveryMethodType = "standard" | "express";

export interface CheckoutPreviewRequest {
    tenantId?: string;
    userId?: string;
    addressId?: string | null;
    couponCode?: string | null;
    deliveryMethod?: DeliveryMethodType;
}

export interface CheckoutPreviewItem {
    productId: string;
    variantId: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
    color?: string;
    size?: string;
    image?: string;
}

export interface CheckoutPreviewData {
    items: CheckoutPreviewItem[];
    subtotal: number;
    couponCode: string | null;
    discount: number;
    shipping: number;
    grandTotal: number;
    deliveryMethod: DeliveryMethodType;
    shippingProvider?: string | null;
    shippingOptions?: Array<{
        id: DeliveryMethodType;
        mode: string;
        estimatedDays?: number | null;
        shippingCost: number;
    }>;
    shippingQuoted?: boolean;
    shippingMeta?: {
        provider?: string | null;
        serviceable?: boolean | null;
        message?: string;
    };
}

export interface CheckoutPreviewResponse {
    success: boolean;
    data: CheckoutPreviewData;
}

export interface PlaceCodOrderRequest {
    tenantId: string;
    userId: string;
    addressId: string;
    couponCode?: string | null;
    deliveryMethod?: DeliveryMethodType;
}

export interface PlaceCodOrderResponse {
    success: boolean;
    message: string;
    orderId: string;
    amount: number;
    paymentStatus: string;
    orderStatus: string;
}

export const previewCheckout = async (
    payload: CheckoutPreviewRequest,
): Promise<CheckoutPreviewData> => {
    const response = await apiClient.post<CheckoutPreviewResponse>(
        API_ENDPOINTS.CHECKOUT.PREVIEW,
        {
            tenantId: payload.tenantId,
            userId: payload.userId,
            addressId: payload.addressId || undefined,
            couponCode: payload.couponCode || undefined,
            deliveryMethod: payload.deliveryMethod || "standard",
        },
    );
    return response.data?.data ?? (() => {
        throw new Error("Unable to load checkout summary.");
    })();
};

export const placeCodOrder = async (
    payload: PlaceCodOrderRequest,
): Promise<PlaceCodOrderResponse> => {
    const response = await apiClient.post<PlaceCodOrderResponse>(
        API_ENDPOINTS.ORDERS.COD,
        {
            tenantId: payload.tenantId,
            userId: payload.userId,
            addressId: payload.addressId,
            couponCode: payload.couponCode || undefined,
            deliveryMethod: payload.deliveryMethod || "standard",
        },
    );
    return response.data;
};
