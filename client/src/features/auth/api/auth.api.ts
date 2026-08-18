import apiClient from "../../../api/client";

import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from "../types";

export const loginApi = async (
  payload: LoginRequest,
): Promise<LoginResponse> => {
  const response = await apiClient.post("/auth/login", payload);

  console.log("LOGIN API RESPONSE:", response.data);

  return response.data;
};

export const registerApi = async (
  payload: RegisterRequest,
): Promise<RegisterResponse> => {
  const response = await apiClient.post("/auth/register", payload);

  return response.data;
};

export const getUser = async (userId: string, tenantId: string | null) => {
  if (!tenantId) {
    return null;
  }

  const response = await apiClient.get(`/users/${userId}?tenantId=${tenantId}`);

  return response.data;
};
