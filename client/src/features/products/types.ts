export interface ProductInventory {
    variantId: string;
    color: string;
    size: string;
    stock: number;
}
export interface Product {
    _id: string;
    tenantId: string;
    name: string;
    description: string;
    categoryId: string;
    categoryName: string;
    brand: string;
    price: number;
    discountPercentage: number;
    finalPrice: number;
    inventory: ProductInventory[];
    images: Record<string, string[]>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    averageRating: number;
    reviewCount: number;
    totalStock?: number;
    stock?: number;
}
export interface ProductSearchRequest {
    tenantId: string;
    name?: string;
    description?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    rating?: number;
    colors?: string[];
    sizes?: string[];
    page?: number;
    limit?: number;
    sort?: string;
}
export interface ProductQueryParams {
    tenantId: string;
    page?: number;
    limit?: number;
    categoryIds?: string[];
    colors?: string[];
    sizes?: string[];
    brands?: string[];
    minPrice?: number;
    maxPrice?: number;
    rating?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}
export interface ProductFilterCategory {
    id: string;
    name: string;
}
export interface ProductFilter {
    brand: string[];
    color: string[];
    size: string[];
    category: ProductFilterCategory[];
    price: {
        min: number;
        max: number;
    };
}
export interface ProductsResponse {
    success: boolean;
    count: number;
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    data: Product[];
    filter?: ProductFilter;
}
export interface Category {
    _id: string;
    tenantId: string;
    name: string;
    description?: string;
    image?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
