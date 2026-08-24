export interface Tenant {
  _id: string;
  tenantId: string;
  name: string;
  slug: string;
  logo: string;
  theme: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface TenantResponse {
  success: boolean;
  count: number;
  data: Tenant[];
}
export interface SingleTenantResponse {
  success: boolean;
  message?: string;
  tenantId?: string;
  id?: string;
  data: Tenant;
}
export interface CreateTenantPayload {
  name: string;
  slug: string;
  logo?: string;
  theme?: string;
}
export interface UpdateTenantPayload {
  name?: string;
  slug?: string;
  logo?: string;
  theme?: string;
  isActive?: boolean;
}
export interface Product {
  _id: string;
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  discountPercentage: number;
  finalPrice: number;
  stock: number;
  sizes: string[];
  colors: string[];
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  averageRating: number;
  reviewCount: number;
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
}
export interface ProductQueryParams {
  tenantId: string;
  page?: number;
  limit?: number;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  colors?: string[];
  rating?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  includeInactive?: boolean;
}
