import {
  useDispatch,
  useSelector,
} from "react-redux";

import type {
  AppDispatch,
  RootState,
} from "../../../app/store";

import type {
  LoginRequest,
  RegisterRequest,
} from "../types";

import {
  getUser,
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
    (state: RootState) => state.auth,
  );


  const login = async (
    payload: LoginRequest,
  ) => {
    const response = await loginApi(payload);

    if (
      !response.success ||
      !response.access_token
    ) {
      return response;
    }


    /*
     * -----------------------------------------
     * SUPER ADMIN LOGIN
     * tenantId = null
     * -----------------------------------------
     */

    if (!payload.tenantId) {
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

      const user = {
        _id: tokenPayload.userId,
        name:
          tokenPayload.name ||
          "Super Admin",
        email:
          tokenPayload.email ||
          payload.email,
        role:
          tokenPayload.role ||
          "super_admin",
        tenantId: null,
      };

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
    }


    /*
     * -----------------------------------------
     * TENANT / CUSTOMER LOGIN
     * tenantId exists
     * -----------------------------------------
     */

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

    const userId =
      tokenPayload.userId;


    const userResponse =
      await getUser(
        userId,
        payload.tenantId,
      );


    if (
      userResponse?.success &&
      userResponse.data
    ) {
      dispatch(
        loginSuccess({
          user: userResponse.data,
          accessToken:
            response.access_token,
        }),
      );
    }


    return {
      ...response,
      user: userResponse?.data,
    };
  };


  const register = async (
    payload: RegisterRequest,
  ) => {
    return registerApi(payload);
  };


  const logoutUser = () => {
    dispatch(logout());
  };


  return {
    user: auth.user,
    accessToken: auth.accessToken,
    isAuthenticated:
      auth.isAuthenticated,
    login,
    register,
    logout: logoutUser,
  };
};