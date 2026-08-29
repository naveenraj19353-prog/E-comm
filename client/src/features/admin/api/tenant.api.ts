import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { CreateTenantPayload, SingleTenantResponse, StorefrontLayout, Tenant, TenantResponse, UpdateTenantPayload, UpdateTenantThemePayload, } from "../types/types";
export const getTenants = async (): Promise<Tenant[]> => {
    const response = await apiClient.get<TenantResponse>(API_ENDPOINTS.TENANTS.LIST);
    return response.data.data;
};
export const getTenantById = async (id: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(API_ENDPOINTS.TENANTS.byId(id));
    return response.data.data;
};
export const getTenantBySlug = async (slug: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(API_ENDPOINTS.TENANTS.bySlug(slug));
    return response.data.data;
};
export const getStorefrontLayout = async (slug: string): Promise<StorefrontLayout & {
    tenantId: string;
    slug: string;
    name: string;
    _id: string;
}> => {
    const response = await apiClient.get<{
        success: boolean;
        data: StorefrontLayout & {
            tenantId: string;
            slug: string;
            name: string;
            _id: string;
        };
    }>(API_ENDPOINTS.TENANTS.storefrontLayout(slug));
    return response.data.data;
};
export const createTenant = async (payload: CreateTenantPayload): Promise<SingleTenantResponse> => {
    const response = await apiClient.post<SingleTenantResponse>(API_ENDPOINTS.TENANTS.CREATE, payload);
    return response.data;
};
export const updateTenant = async (id: string, payload: UpdateTenantPayload): Promise<SingleTenantResponse> => {
    const response = await apiClient.put<SingleTenantResponse>(API_ENDPOINTS.TENANTS.byId(id), payload);
    return response.data;
};
export const deleteTenant = async (id: string): Promise<void> => {
    await apiClient.delete(API_ENDPOINTS.TENANTS.byId(id));
};

export const updateTenantTheme = async (
    id: string,
    payload: UpdateTenantThemePayload,
): Promise<SingleTenantResponse> => {
    const response = await apiClient.patch<SingleTenantResponse>(API_ENDPOINTS.TENANTS.theme(id), payload);
    return response.data;
};
export const getTenantByTenantId = async (tenantId: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(API_ENDPOINTS.TENANTS.byTenantId(tenantId));
    return response.data.data;
};
