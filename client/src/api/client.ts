import axios from "axios";
const apiClient = axios.create({
  baseURL: "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});
apiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem("ecommerce_auth");
  if (stored) {
    try {
      const auth = JSON.parse(stored);
      if (auth.accessToken) {
        config.headers.Authorization = `Bearer ${auth.accessToken}`;
      }
    } catch (error) {
      console.error("Invalid auth storage", error);
    }
  }
  return config;
});
export default apiClient;
