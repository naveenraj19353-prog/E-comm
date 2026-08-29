import apiClient from "../../../api/client";

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

export const FREE_SHIPPING_THRESHOLD = 1000;
export const STANDARD_SHIPPING_FEE = 100;
export const EXPRESS_DELIVERY_FEE = 99;

export const getDeliveryCharge = (
    subtotal: number,
    deliveryMethod: DeliveryMethodType,
): number => {
    const baseShipping =
        subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    return deliveryMethod === "express"
        ? baseShipping + EXPRESS_DELIVERY_FEE
        : baseShipping;
};

export const previewCheckout = async (
    payload: CheckoutPreviewRequest,
): Promise<CheckoutPreviewData> => {
    const response = await apiClient.post<CheckoutPreviewResponse>(
        "/checkout/",
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
        "/orders/cod",
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
