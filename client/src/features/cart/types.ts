export interface CartItem {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  image: string;
}

export interface CartResponse {
  success: boolean;
  count: number;
  grandTotal: number;
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
}

export interface CartItem {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  image: string;
}

export interface CartResponse {
  success: boolean;
  count: number;
  grandTotal: number;
  data: CartItem[];
}