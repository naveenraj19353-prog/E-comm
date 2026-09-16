import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type CustomerActivity = {
    cart: Array<{
        productId: string;
        name: string;
        category: string;
        quantity: number;
    }>;
    cartCount: number;
    wishlist: Array<{
        productId: string;
        name: string;
        category: string;
    }>;
    wishlistCount: number;
};

export type AdminCustomer = {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    counterNumber?: string;
    isActive?: boolean;
    createdAt?: string;
    activity: CustomerActivity;
};

export async function getAdminCustomers(
    tenantId: string,
): Promise<AdminCustomer[]> {
    const response = await apiClient.get(API_ENDPOINTS.USERS.LIST, {
        params: { tenantId },
    });
    return response.data.data;
}
