import apiClient from "../../../api/client";
import type { CreateTenantPayload, SingleTenantResponse, Tenant, TenantResponse, UpdateTenantPayload, } from "../types/type";
export const getTenants = async (): Promise<Tenant[]> => {
    const response = await apiClient.get<TenantResponse>("/tenants/");
    return response.data.data;
};
export const getTenantById = async (id: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(`/tenants/${id}`);
    return response.data.data;
};
export const getTenantBySlug = async (slug: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(`/tenants/slug/${slug}`);
    return response.data.data;
};
export const createTenant = async (payload: CreateTenantPayload): Promise<SingleTenantResponse> => {
    const response = await apiClient.post<SingleTenantResponse>("/tenants/", payload);
    return response.data;
};
export const updateTenant = async (id: string, payload: UpdateTenantPayload): Promise<SingleTenantResponse> => {
    const response = await apiClient.put<SingleTenantResponse>(`/tenants/${id}`, payload);
    return response.data;
};
export const deleteTenant = async (id: string): Promise<void> => {
    await apiClient.delete(`/tenants/${id}`);
};
export const getTenantByTenantId = async (tenantId: string): Promise<Tenant> => {
    const response = await apiClient.get<SingleTenantResponse>(`/tenants/tenant-id/${tenantId}`);
    return response.data.data;
};
