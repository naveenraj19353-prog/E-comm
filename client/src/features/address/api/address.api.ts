import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { Address, CreateAddressRequest, UpdateAddressRequest, } from "../types/address.types";
export const getAddresses = async (userId: string, tenantId: string): Promise<Address[]> => {
    const response = await apiClient.get(API_ENDPOINTS.ADDRESSES.byUserId(userId), {
        params: { tenantId },
    });
    return response.data.data;
};
export const createAddress = async (payload: CreateAddressRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.ADDRESSES.CREATE, payload);
    return response.data;
};
export const updateAddress = async (id: string, payload: UpdateAddressRequest) => {
    const response = await apiClient.put(API_ENDPOINTS.ADDRESSES.update(id), payload);
    return response.data;
};
export const deleteAddress = async (id: string, tenantId: string) => {
    const response = await apiClient.delete(API_ENDPOINTS.ADDRESSES.byId(id), {
        params: { tenantId },
    });
    return response.data;
};
