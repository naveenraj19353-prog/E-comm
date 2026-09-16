import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type PlaceMenuOrderResponse = {
    success: boolean;
    message?: string;
    orderId?: string;
    amount?: number;
    paymentStatus?: string;
    orderStatus?: string;
    counterNumber?: string;
};

export const placeMenuOrder = async (payload?: {
    counterNumber?: string;
}): Promise<PlaceMenuOrderResponse> => {
    const response = await apiClient.post(
        API_ENDPOINTS.ORDERS.MENU,
        payload?.counterNumber
            ? { counterNumber: payload.counterNumber }
            : {},
    );
    return response.data;
};
