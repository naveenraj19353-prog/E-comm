import {
    createTenant,
    deleteTenant,
    getTenantByTenantId,
    getTenants,
    updateTenant,
  } from "../api/tenant.api";
  
  import {
    useMutation,
    useQuery,
    useQueryClient,
  } from "@tanstack/react-query";
  
  import type {
    CreateTenantPayload,
    UpdateTenantPayload,
  } from "../types/type";
  
  export const TENANTS_QUERY_KEY = ["tenants"];
  
  /* ================================
     GET ALL TENANTS
  ================================ */
  
  export const useTenants = () => {
    return useQuery({
      queryKey: TENANTS_QUERY_KEY,
      queryFn: getTenants,
    });
  };
  
  /* ================================
     GET TENANT BY TENANT ID
  ================================ */
  
  export const useTenantByTenantId = (
    tenantId: string
  ) => {
    return useQuery({
      queryKey: [
        "tenant",
        "tenantId",
        tenantId,
      ],
      queryFn: () =>
        getTenantByTenantId(tenantId),
      enabled: !!tenantId,
    });
  };
  
  /* ================================
     CREATE TENANT
  ================================ */
  
  export const useCreateTenant = () => {
    const queryClient = useQueryClient();
  
    return useMutation({
      mutationFn: (
        payload: CreateTenantPayload
      ) => createTenant(payload),
  
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: TENANTS_QUERY_KEY,
        });
      },
    });
  };
  
  /* ================================
     UPDATE TENANT
  ================================ */
  
  export const useUpdateTenant = () => {
    const queryClient = useQueryClient();
  
    return useMutation({
      mutationFn: ({
        id,
        payload,
      }: {
        id: string;
        payload: UpdateTenantPayload;
      }) =>
        updateTenant(id, payload),
  
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: TENANTS_QUERY_KEY,
        });
      },
    });
  };
  
  /* ================================
     DELETE TENANT
  ================================ */
  
  export const useDeleteTenant = () => {
    const queryClient = useQueryClient();
  
    return useMutation({
      mutationFn: (id: string) =>
        deleteTenant(id),
  
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: TENANTS_QUERY_KEY,
        });
      },
    });
  };