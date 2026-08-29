export interface ForgotPasswordRequest {
    tenantId?: string | null;
    email: string;
}

export interface ForgotPasswordResponse {
    success: boolean;
    message: string;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
}

export interface ResetPasswordResponse {
    success: boolean;
    message: string;
    loginPath?: string;
}
