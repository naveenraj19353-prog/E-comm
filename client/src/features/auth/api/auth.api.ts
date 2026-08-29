import apiClient from "../../../api/client";
import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, } from "../types";
import type {
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
} from "../types/password.types";

export const loginApi = async (payload: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post("/auth/login", payload);
    return response.data;
};
export const registerApi = async (payload: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post("/auth/register", payload);
    return response.data;
};
export const forgotPasswordApi = async (
    payload: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post("/auth/forgot-password", {
        tenantId: payload.tenantId?.trim() || null,
        email: payload.email.trim(),
    });
    return response.data;
};
export const resetPasswordApi = async (
    payload: ResetPasswordRequest,
): Promise<ResetPasswordResponse> => {
    const response = await apiClient.post("/auth/reset-password", payload);
    return response.data;
};
export const getUser = async (userId: string, tenantId: string | null) => {
    if (!tenantId) {
        return null;
    }
    const response = await apiClient.get(`/users/${userId}?tenantId=${tenantId}`);
    return response.data;
};
