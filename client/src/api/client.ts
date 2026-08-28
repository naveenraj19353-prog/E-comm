import axios from "axios";
import { API_BASE_URL } from "../constants/api";
import {
    clearStoredAccessToken,
    getStoredAccessToken,
} from "../features/auth/token";

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
            clearStoredAccessToken();
        }
        return Promise.reject(error);
    },
);

export default apiClient;
