import axios from "axios";
import { store } from "../redux/store";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

api.interceptors.request.use((config) => {
  const tenant = store.getState().tenant.currentTenant;

  if (tenant) {
    config.headers["X-Tenant-Id"] = tenant.id;
  }

  return config;
});

export default api;