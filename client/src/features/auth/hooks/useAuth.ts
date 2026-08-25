import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../app/store";
import type { LoginRequest, RegisterRequest } from "../types";
import {
  loginApi,
  registerApi,
} from "../api/auth.api";
import {
  loginSuccess,
  logout,
} from "../authSlice";
export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector(
    (state: RootState) => state.auth
  );
  // ==========================================================
  // LOGIN
  // ==========================================================
const login = async (payload: LoginRequest) => {
  const response = await loginApi(payload);
  if (
    !response.success ||
    !response.access_token
  ) {
    return response;
  }
  // ==================================================
  // DECODE TOKEN
  // ==================================================
  const tokenParts =
    response.access_token.split(".");
  if (tokenParts.length !== 3) {
    throw new Error(
      "Invalid authentication token.",
    );
  }
  const tokenPayload = JSON.parse(
    atob(tokenParts[1]),
  );
  console.log(
    "TOKEN PAYLOAD:",
    tokenPayload,
  );
  // ==================================================
  // USER FROM API RESPONSE
  // ==================================================
  const user = {
    _id: response.user?.userId || tokenPayload.userId,
    userId: response.user?.userId || tokenPayload.userId,
    name:
      response.user?.name ||
      tokenPayload.name ||
      "",
    email:
      response.user?.email ||
      tokenPayload.email ||
      payload.email,
    role:
      response.user?.role ||
      tokenPayload.role ||
      "",
    tenantId:
      response.user?.tenantId ??
      tokenPayload.tenantId ??
      null,
  };
  console.log(
    "FINAL AUTH USER:",
    user,
  );
  // ==================================================
  // SAVE AUTH
  // ==================================================
  dispatch(
    loginSuccess({
      user,
      accessToken:
        response.access_token,
    }),
  );
  return {
    ...response,
    user,
  };
};
  // ==========================================================
  // REGISTER
  // ==========================================================
  const register = async (
    payload: RegisterRequest
  ) => {
    return registerApi(payload);
  };
  // ==========================================================
  // LOGOUT
  // ==========================================================
  const logoutUser = () => {
    dispatch(logout());
  };
  // ==========================================================
  // RETURN
  // ==========================================================
  return {
    user: auth.user,
    accessToken: auth.accessToken,
    isAuthenticated: auth.isAuthenticated,
    login,
    register,
    logout: logoutUser,
  };
};
