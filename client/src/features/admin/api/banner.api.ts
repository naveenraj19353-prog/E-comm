import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type BannerRecord = {
  _id: string;
  tenantId: string;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  image: string;
  mobileImage?: string | null;
  mediaType?: "image" | "video" | string | null;
  buttonText?: string | null;
  link?: string | null;
  priority?: number;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BannerPayload = {
  tenantId: string;
  title?: string;
  subtitle?: string;
  description?: string;
  image: string;
  mobileImage?: string;
  mediaType?: "image" | "video";
  buttonText?: string;
  link?: string;
  priority?: number;
  isActive?: boolean;
};

export type BannerUpdatePayload = Partial<Omit<BannerPayload, "tenantId">>;

export async function getBanners(tenantId: string) {
  const response = await apiClient.get(API_ENDPOINTS.BANNER.GET_ALL, {
    params: { tenantId },
  });
  return (response.data.data || []) as BannerRecord[];
}

export async function createBanner(payload: BannerPayload) {
  const response = await apiClient.post(API_ENDPOINTS.BANNER.CREATE, payload);
  return response.data as { success: boolean; message?: string; bannerId?: string };
}

export async function updateBanner(bannerId: string, payload: BannerUpdatePayload) {
  const response = await apiClient.put(API_ENDPOINTS.BANNER.update(bannerId), payload);
  return response.data as { success: boolean; message?: string; data?: BannerRecord };
}

export async function deleteBanner(bannerId: string) {
  const response = await apiClient.delete(API_ENDPOINTS.BANNER.delete(bannerId));
  return response.data as { success: boolean; message?: string };
}
