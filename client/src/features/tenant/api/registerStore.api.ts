import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type RegisterStorePayload = {
  name: string;
  slug: string;
  email: string;
  password: string;
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
