import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { HomeResponse } from "../types/home.types";
export const getHome = async (tenantId: string, productLimit = 10, categoryLimit = 12): Promise<HomeResponse> => {
    const response = await apiClient.get<HomeResponse>(API_ENDPOINTS.HOME.GET, {
        params: {
            tenantId,
            productLimit,
            categoryLimit,
        },
    });
    return response.data;
};
