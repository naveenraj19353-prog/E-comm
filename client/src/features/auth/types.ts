export interface User {
    name: string;
    /** Phone-only customers (WhatsApp sign-in) have no email. */
    email: string;
    role: string;
    tenantId?: string | null;
    _id: string;
    userId?: string;
    phone?: string;
    counterNumber?: string;
    permissions?: Partial<Record<string, boolean>>;
}
export interface LoginRequest {
    tenantId: string | null;
    email: string;
    password: string;
}
export interface MenuLoginRequest {
    tenantId: string;
    phone: string;
    password: string;
    counterNumber: string;
}
export interface LoginResponse {
    success: boolean;
    access_token: string;
    token_type: string;
    user?: User;
}
export interface RegisterRequest {
    tenantId: string;
    name: string;
    email: string;
    phone: string;
    password: string;
}
export interface RegisterResponse {
    success: boolean;
    message: string;
}
export type AuthSlotState =
    | { kind: "admin" }
    | { kind: "store"; slug: string };
export interface AuthState {
    /** Session of the context being viewed (current store's customer, or admin panel user). */
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    /** Which stored session `user` comes from. */
    slot: AuthSlotState;
    /** Admin-panel session (staff / super admin), available on storefront pages too. */
    staffUser: User | null;
}
export interface CustomerOtpSendRequest {
    tenantId: string;
    phone: string;
}
export interface CustomerOtpSendResponse {
    success: boolean;
    message: string;
    expiresInSeconds: number;
    resendInSeconds?: number;
    phone?: string;
}
export interface CustomerOtpVerifyRequest {
    tenantId: string;
    phone: string;
    otp: string;
    name?: string;
}
export interface CustomerOtpVerifyResponse extends LoginResponse {
    isNewCustomer?: boolean;
}
