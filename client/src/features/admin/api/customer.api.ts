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

/** Non-cancelled orders; spend is order totals minus refunds. */
export type CustomerOrderStats = {
    orderCount: number;
    totalSpent: number;
    lastOrderAt: string | null;
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
    orderStats?: CustomerOrderStats;
};

export type AdminCustomersPage = {
    data: AdminCustomer[];
    total: number;
    page: number;
    pageSize: number;
};

/** Internal note about a customer (REQ-065); never shown to the customer. */
export type CustomerNote = {
    id: string;
    text: string;
    authorName: string;
    createdAt: string;
    canDelete: boolean;
};

export async function getCustomerNotes(tenantId: string, customerId: string): Promise<CustomerNote[]> {
    const response = await apiClient.get(API_ENDPOINTS.USERS.customerNotes(customerId), { params: { tenantId } });
    return response.data?.data ?? [];
}

export async function addCustomerNote(tenantId: string, customerId: string, text: string): Promise<CustomerNote> {
    const response = await apiClient.post(API_ENDPOINTS.USERS.customerNotes(customerId), { tenantId, text });
    return response.data?.data;
}

export async function deleteCustomerNote(tenantId: string, customerId: string, noteId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.USERS.customerNoteById(customerId, noteId), { params: { tenantId } });
}

export async function getAdminCustomers(
    tenantId: string,
    page = 1,
    pageSize = 25,
    search = "",
): Promise<AdminCustomersPage> {
    const params: Record<string, string | number> = { tenantId, page, pageSize };
    const term = search.trim();
    if (term) {
        params.search = term;
    }
    const response = await apiClient.get(API_ENDPOINTS.USERS.LIST, { params });
    const body = response.data || {};
    const data: AdminCustomer[] = body.data || [];
    return {
        data,
        total: typeof body.total === "number" ? body.total : data.length,
        page: typeof body.page === "number" ? body.page : page,
        pageSize: typeof body.pageSize === "number" ? body.pageSize : pageSize,
    };
}
