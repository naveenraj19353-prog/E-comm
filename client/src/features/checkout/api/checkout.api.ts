import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { StoreTax } from "../../../types/tax";

export type DeliveryMethodType = "standard" | "express";

export interface CheckoutPreviewRequest {
    tenantId?: string;
    userId?: string;
    addressId?: string | null;
    couponCode?: string | null;
    deliveryMethod?: DeliveryMethodType;
    paymentMethod?: string | null;
    addressStamp?: string | null;
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
    hsnCode?: string | null;
    gstRate?: number | null;
}

// Re-exported so callers can import the tax shapes from here as before; the
// canonical definitions live in types/tax.ts because the cart shares them.
export type { StoreTax, TaxLine, TaxRateBucket } from "../../../types/tax";

export interface CheckoutPreviewData {
    items: CheckoutPreviewItem[];
    subtotal: number;
    couponCode: string | null;
    discount: number;
    shipping: number;
    grandTotal: number;
    /** GST split for this cart. All zero when the store charges no tax. */
    tax?: StoreTax;
    deliveryMethod: DeliveryMethodType;
    shippingProvider?: string | null;
    shippingOptions?: Array<{
        id: DeliveryMethodType;
        mode: string;
        estimatedDays?: number | null;
        shippingCost: number;
        /** Set when the store's free-delivery threshold is met. */
        originalShippingCost?: number | null;
        freeDelivery?: boolean;
    }>;
    shippingQuoted?: boolean;
    freeDelivery?: boolean;
    freeDeliveryThreshold?: number | null;
    shippingMeta?: {
        provider?: string | null;
        serviceable?: boolean | null;
        message?: string;
        codHandlingCharge?: number | null;
    };
    /** Extra the delivery partner bills for COD vs. paying online, for the
     * same route and weight. null when it isn't known yet (e.g. no address
     * picked). */
    codHandlingCharge?: number | null;
    address?: {
        _id: string;
        fullName?: string;
        phone?: string;
        postalCode?: string;
        isDefault?: boolean;
    } | null;
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
            paymentMethod: payload.paymentMethod || undefined,
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
