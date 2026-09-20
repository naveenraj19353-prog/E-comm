import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type ShippingOptionQuote = {
    id: string;
    mode: string;
    estimatedDays?: number | null;
    shippingCost: number;
};

export type PincodeCheckResult = {
    success: boolean;
    connected: boolean;
    serviceable: boolean;
    cod: boolean;
    pincode: string;
    city?: string | null;
    estimatedDays?: number | null;
    shippingOptions?: ShippingOptionQuote[];
    message: string;
};

export async function checkDeliveryPincode(
    tenantId: string,
    pincode: string,
): Promise<PincodeCheckResult> {
    const response = await apiClient.get(API_ENDPOINTS.DELHIVERY.PINCODE_CHECK, {
        params: { tenantId, pincode },
    });
    return response.data as PincodeCheckResult;
}
