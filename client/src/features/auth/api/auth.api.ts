import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, } from "../types";
import type {
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
} from "../types/password.types";

export const loginApi = async (payload: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, payload);
    return response.data;
};
export const registerApi = async (payload: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, payload);
    return response.data;
};
export const forgotPasswordApi = async (
    payload: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        tenantId: payload.tenantId?.trim() || null,
        email: payload.email.trim(),
    });
    return response.data;
};
export const resetPasswordApi = async (
    payload: ResetPasswordRequest,
): Promise<ResetPasswordResponse> => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload);
    return response.data;
};
export const getUser = async (userId: string, tenantId: string | null) => {
    if (!tenantId) {
        return null;
    }
    const response = await apiClient.get(API_ENDPOINTS.USERS.byId(userId), {
        params: { tenantId },
    });
    return response.data;
};
