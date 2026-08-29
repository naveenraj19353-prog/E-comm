import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { ProfileResponse, UpdateProfileRequest, UpdateProfileResponse, } from "../type/types";
export const getProfile = async (tenantId: string, userId: string): Promise<ProfileResponse> => {
    const response = await apiClient.get(API_ENDPOINTS.PROFILE.GET, {
        params: {
            tenantId,
            userId,
        },
    });
    return response.data;
};
export const updateProfile = async (tenantId: string, userId: string, data: UpdateProfileRequest): Promise<UpdateProfileResponse> => {
    const response = await apiClient.put(API_ENDPOINTS.PROFILE.UPDATE, data, {
        params: {
            tenantId,
            userId,
        },
    });
    return response.data;
};
