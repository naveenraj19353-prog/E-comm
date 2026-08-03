export const storage = {
    getTenant: () => localStorage.getItem("tenantId"),
  
    setTenant: (tenantId: string) =>
      localStorage.setItem("tenantId", tenantId),
  
    getToken: () => localStorage.getItem("token"),
  
    setToken: (token: string) =>
      localStorage.setItem("token", token),
  
    clear: () => localStorage.clear(),
  };