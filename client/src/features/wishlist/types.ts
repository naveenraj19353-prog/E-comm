export interface WishlistItem {
  wishlistId: string;
  productId: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  addedAt: string;
}
export interface WishlistResponse {
  success: boolean;
  count: number;
  data: WishlistItem[];
}
