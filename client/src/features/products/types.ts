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
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
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
