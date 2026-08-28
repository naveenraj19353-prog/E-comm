import axios from "axios";
import { getStoredAccessToken } from "../features/auth/token";
const apiClient = axios.create({
    baseURL: "http://127.0.0.1:8000",
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
export default apiClient;
