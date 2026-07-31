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

export interface ProductResponse {
  success: boolean;
  data: [];
}

export interface Category {
  tenantId: string;
  name: string;
  description: string;
  image: string;
}

export interface CategoryResponse {
  success: boolean;
  data: Category[];
}