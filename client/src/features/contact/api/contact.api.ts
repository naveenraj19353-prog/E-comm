import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type ContactMessage = {
    id: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
    status?: "new" | "read";
    createdAt?: string;
    readAt?: string | null;
};

export const submitContactMessage = async (payload: {
    tenantId: string;
    name: string;
    email: string;
    message: string;
}): Promise<ContactMessage> => {
    const response = await apiClient.post<{ success: boolean; message: ContactMessage }>(
        API_ENDPOINTS.CONTACT.CREATE,
        payload,
    );
    if (!response.data?.message) {
        throw new Error("Unable to send your message.");
    }
    return response.data.message;
};

export const getAdminContactMessages = async (
    tenantId: string,
): Promise<ContactMessage[]> => {
    const response = await apiClient.get<{ success: boolean; data: ContactMessage[] }>(
        API_ENDPOINTS.CONTACT.ADMIN_LIST,
        { params: { tenantId } },
    );
    return response.data?.data ?? [];
};

export const markAdminContactRead = async (
    messageId: string,
    tenantId: string,
): Promise<ContactMessage> => {
    const response = await apiClient.patch<{ success: boolean; message: ContactMessage }>(
        API_ENDPOINTS.CONTACT.adminRead(messageId),
        {},
        { params: { tenantId } },
    );
    if (!response.data?.message) {
        throw new Error("Unable to mark the message as read.");
    }
    return response.data.message;
};
