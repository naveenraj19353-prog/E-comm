import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../app/store";
import type {
    CustomerOtpSendRequest,
    CustomerOtpVerifyRequest,
    LoginRequest,
    MenuLoginRequest,
    RegisterRequest,
} from "../types";
import {
    loginApi,
    menuLoginApi,
    registerApi,
    sendCustomerOtpApi,
    verifyCustomerOtpApi,
} from "../api/auth.api";
import { loginSuccess, logout } from "../authSlice";
import { getUserFromAccessToken } from "../token";

export const useAuth = () => {
    const dispatch = useDispatch<AppDispatch>();
    const auth = useSelector((state: RootState) => state.auth);
    const login = async (payload: LoginRequest) => {
        const response = await loginApi(payload);
        if (!response.success || !response.access_token) {
            return response;
        }
        dispatch(loginSuccess({ accessToken: response.access_token }));
        const user = getUserFromAccessToken(response.access_token);
        return { ...response, user };
    };
    const menuLogin = async (payload: MenuLoginRequest) => {
        const response = await menuLoginApi(payload);
        if (!response.success || !response.access_token) {
            return response;
        }
        dispatch(loginSuccess({ accessToken: response.access_token }));
        const user = getUserFromAccessToken(response.access_token);
        return { ...response, user };
    };
    /** Step 1 of phone sign-in: WhatsApp a 6-digit code. */
    const sendPhoneOtp = (payload: CustomerOtpSendRequest) => sendCustomerOtpApi(payload);
    /** Step 2: verify the code; signs in (creating the customer if new) for this store. */
    const verifyPhoneOtp = async (payload: CustomerOtpVerifyRequest) => {
        const response = await verifyCustomerOtpApi(payload);
        if (!response.success || !response.access_token) {
            return response;
        }
        dispatch(loginSuccess({ accessToken: response.access_token }));
        const user = getUserFromAccessToken(response.access_token);
        return { ...response, user };
    };
    const register = async (payload: RegisterRequest) => {
        return registerApi(payload);
    };
    /** Signs out of the context being viewed only (this store, or the admin panel). */
    const logoutUser = () => {
        // Visiting /logout directly means "sign me out of this browser".
        const everywhere = typeof window !== "undefined" && window.location.pathname === "/logout";
        dispatch(logout(everywhere ? { all: true } : undefined));
    };
    /** Signs out of the admin panel and every store on this browser. */
    const logoutEverywhere = () => {
        dispatch(logout({ all: true }));
    };
    return {
        user: auth.user,
        accessToken: auth.accessToken,
        isAuthenticated: auth.isAuthenticated,
        staffUser: auth.staffUser,
        login,
        menuLogin,
        sendPhoneOtp,
        verifyPhoneOtp,
        register,
        logout: logoutUser,
        logoutEverywhere,
    };
};
