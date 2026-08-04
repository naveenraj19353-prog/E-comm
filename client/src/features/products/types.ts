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