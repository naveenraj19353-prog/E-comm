import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../app/store";
import type { LoginRequest, RegisterRequest } from "../types";
import { loginApi, registerApi, } from "../api/auth.api";
import { loginSuccess, logout, } from "../authSlice";
import { getUserFromAccessToken } from "../token";
export const useAuth = () => {
    const dispatch = useDispatch<AppDispatch>();
    const auth = useSelector((state: RootState) => state.auth);
    const login = async (payload: LoginRequest) => {
        const response = await loginApi(payload);
        if (!response.success ||
            !response.access_token) {
            return response;
        }
        dispatch(loginSuccess({
            accessToken: response.access_token,
        }));
        const user = getUserFromAccessToken(response.access_token);
        return {
            ...response,
            user,
        };
    };
    const register = async (payload: RegisterRequest) => {
        return registerApi(payload);
    };
    const logoutUser = () => {
        dispatch(logout());
    };
    return {
        user: auth.user,
        accessToken: auth.accessToken,
        isAuthenticated: auth.isAuthenticated,
        login,
        register,
        logout: logoutUser,
    };
};
