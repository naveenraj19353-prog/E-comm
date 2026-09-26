import type { StoreTax } from "../../types/tax";

export interface CartItem {
    cartId: string;
    productId: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
    image: string;
    /** Carried so the cart can show the GST split before checkout. */
    gstRate?: number | null;
    hsnCode?: string | null;
}
export interface CartResponse {
    success: boolean;
    count: number;
    grandTotal: number;
    /** All zero for a store that charges no tax; the UI then renders nothing. */
    tax?: StoreTax;
    data: CartItem[];
}
export interface UpdateCartRequest {
    tenantId: string;
    userId: string;
    quantity: number;
}
export interface AddToCartRequest {
    tenantId: string;
    userId: string;
    productId: string;
    quantity: number;
    variantId: string;
    color?: string;
    size?: string;
}
