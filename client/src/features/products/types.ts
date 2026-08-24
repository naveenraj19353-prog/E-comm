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
  /*
   * Inventory contains the actual purchasable variants.
   *
   * Example:
   *
   * [
   *   {
   *     variantId: "default-red",
   *     color: "Red",
   *     size: "Default",
   *     stock: 1
   *   }
   * ]
   */
  inventory: ProductInventory[];
  /*
   * Images are grouped by color.
   *
   * Example:
   *
   * {
   *   Red: [
   *     "image1",
   *     "image2"
   *   ],
   *   Black: [
   *     "image3",
   *     "image4"
   *   ]
   * }
   */
  images: Record<string, string[]>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  averageRating: number;
  reviewCount: number;
  /*
   * Optional because some API endpoints
   * may not return totalStock.
   */
  totalStock?: number;
}
/* =========================================================
   PRODUCT SEARCH
========================================================= */
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
/* =========================================================
   PRODUCT QUERY PARAMS
========================================================= */
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
/* =========================================================
   PRODUCTS RESPONSE
========================================================= */
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
/* =========================================================
   CATEGORY
========================================================= */
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
