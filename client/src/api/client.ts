import axios from "axios";
import { store } from "../app/store";
import { API_BASE_URL } from "../constants/api";
import { logout } from "../features/auth/authSlice";
import { getStoredAccessToken } from "../features/auth/token";

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

apiClient.interceptors.request.use((config) => {
    const accessToken = getStoredAccessToken();
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            store.dispatch(logout());
        }
        return Promise.reject(error);
    },
);

export default apiClient;
