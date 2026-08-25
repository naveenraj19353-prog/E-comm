export interface WishlistItem {
    wishlistId: string;
    productId: string;
    name: string;
    price: number;
    finalPrice?: number;
    discountPercentage?: number;
    image?: string;
    images?: Record<string, string[]>;
    inventory?: {
        variantId: string;
        color: string;
        size: string;
        stock: number;
    }[];
    stock: number;
    totalStock?: number;
    averageRating?: number;
    reviewCount?: number;
    isActive?: boolean;
    addedAt: string;
}
export interface WishlistResponse {
    success: boolean;
    count: number;
    data: WishlistItem[];
}
