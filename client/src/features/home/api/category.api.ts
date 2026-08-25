import apiClient from "../../../api/client";
export interface Category {
    _id: string;
    tenantId: string;
    name: string;
    description?: string;
    image?: string;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}
interface CategoryResponse {
    success: boolean;
    count: number;
    data: Category[];
}
export async function getCategories(tenantId: string): Promise<Category[]> {
    const response = await apiClient.get<CategoryResponse>(`/categories/?tenantId=${tenantId}`);
    return response.data.data;
}
