import api from "../api/axios";

export interface LoginRequest {
  tenantId: string;
  email: string;
  password: string;
}

export const login = async (payload: LoginRequest) => {
  const { data } = await api.post("/auth/login", payload);

  return data;
};