import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type CouponOfferType = "general" | "first_order" | "product" | "category" | "festival";
export type CouponDiscountType = "percentage" | "fixed";

export type CouponRecord = {
  _id: string;
  tenantId: string;
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  usedCount?: number;
  offerType?: CouponOfferType;
  productId?: string | null;
  categoryId?: string | null;
  festivalTitle?: string;
  festivalMessage?: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
};

export type CouponPayload = {
  tenantId: string;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscount: number;
  usageLimit: number;
  perCustomerLimit: number;
  startDate: string;
  endDate: string;
  offerType: CouponOfferType;
  productId?: string | null;
  categoryId?: string | null;
  festivalTitle?: string;
  festivalMessage?: string;
  isActive: boolean;
};

export async function listCoupons(tenantId: string) {
  const response = await apiClient.get(API_ENDPOINTS.COUPON.LIST, {
    params: { tenantId },
  });
  return (response.data.data || []) as CouponRecord[];
}

export async function createCoupon(payload: CouponPayload) {
  const response = await apiClient.post(API_ENDPOINTS.COUPON.CREATE, payload);
  return response.data as { success: boolean; couponId?: string; message?: string };
}

export async function updateCoupon(
  couponId: string,
  payload: Partial<CouponPayload>,
) {
  const response = await apiClient.put(API_ENDPOINTS.COUPON.update(couponId), payload);
  return response.data as { success: boolean; message?: string; data?: CouponRecord };
}
