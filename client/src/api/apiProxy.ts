import apiClient from "./apiClient";

export const apiProxy = {
  get: async <T>(url: string, params?: object) => {
    const { data } = await apiClient.get<T>(url, {
      params,
    });

    return data;
  },

  post: async <T>(url: string, body: object) => {
    const { data } = await apiClient.post<T>(url, body);

    return data;
  },

  put: async <T>(url: string, body: object) => {
    const { data } = await apiClient.put<T>(url, body);

    return data;
  },

  delete: async <T>(url: string) => {
    const { data } = await apiClient.delete<T>(url);

    return data;
  },
};