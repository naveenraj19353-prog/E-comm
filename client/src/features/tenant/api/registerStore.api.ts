import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { BusinessType } from "../../../constants/businessTypes";

export type RegisterStorePayload = {
  name: string;
  slug: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  password: string;
  otp: string;
};

export type SendStoreSignupOtpResponse = {
  success: boolean;
  message?: string;
  expiresInSeconds?: number;
};

export type RegisterStoreResponse = {
  success: boolean;
  message?: string;
  access_token: string;
  token_type?: string;
  tenantId: string;
  slug: string;
  data?: {
    tenantId: string;
    slug: string;
    name: string;
    email: string;
  };
  user?: {
    userId: string;
    name: string;
    email: string;
    tenantId: string;
    role: string;
  };
};

export const registerStoreApi = async (
  payload: RegisterStorePayload,
): Promise<RegisterStoreResponse> => {
  const response = await apiClient.post<RegisterStoreResponse>(
    API_ENDPOINTS.TENANTS.REGISTER,
    payload,
  );
  return response.data;
};

export const sendStoreSignupOtpApi = async (payload: {
  email: string;
  phone: string;
}): Promise<SendStoreSignupOtpResponse> => {
  const response = await apiClient.post<SendStoreSignupOtpResponse>(
    API_ENDPOINTS.TENANTS.REGISTER_SEND_OTP,
    payload,
  );
  return response.data;
};
