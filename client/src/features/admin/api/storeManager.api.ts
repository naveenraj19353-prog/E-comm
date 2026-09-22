import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type StoreManager = {
    _id: string;
    tenantId: string;
    name: string;
    email: string;
    phone?: string | null;
    role: "store_manager";
    isActive?: boolean;
    createdAt?: string;
    permissions?: Record<string, boolean>;
};

export async function listStoreManagers(tenantId: string): Promise<StoreManager[]> {
    const response = await apiClient.get(API_ENDPOINTS.USERS.STORE_MANAGERS, {
        params: { tenantId },
    });
    return response.data.data;
}

export async function createStoreManager(payload: {
    tenantId: string;
    name: string;
    email: string;
    phone?: string;
    password: string;
    permissions: Record<string, boolean>;
}): Promise<StoreManager> {
    const response = await apiClient.post(API_ENDPOINTS.USERS.STORE_MANAGERS, payload);
    return response.data.data;
}

export async function updateStoreManager(payload: {
    id: string;
    tenantId: string;
    permissions: Record<string, boolean>;
}): Promise<StoreManager> {
    const response = await apiClient.put(API_ENDPOINTS.USERS.storeManagerById(payload.id), {
        tenantId: payload.tenantId,
        permissions: payload.permissions,
    });
    return response.data.data;
}

export async function deleteStoreManager(id: string, tenantId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.USERS.storeManagerById(id), {
        params: { tenantId },
    });
}
