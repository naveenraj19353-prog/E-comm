import { createTenant, deleteTenant, getTenantByTenantId, getTenants, updateTenant, } from "../api/tenant.api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTenantPayload, UpdateTenantPayload } from "../types/types";
export const TENANTS_QUERY_KEY = ["tenants"];
export const useTenants = () => {
    return useQuery({
        queryKey: TENANTS_QUERY_KEY,
        queryFn: getTenants,
    });
};
export const useTenantByTenantId = (tenantId: string) => {
    return useQuery({
        queryKey: ["tenant", "tenantId", tenantId],
        queryFn: () => getTenantByTenantId(tenantId),
        enabled: !!tenantId,
    });
};
export const useCreateTenant = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateTenantPayload) => createTenant(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: TENANTS_QUERY_KEY,
            });
        },
    });
};
export const useUpdateTenant = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload, }: {
            id: string;
            payload: UpdateTenantPayload;
        }) => updateTenant(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: TENANTS_QUERY_KEY,
            });
        },
    });
};
export const useDeleteTenant = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteTenant(id),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: TENANTS_QUERY_KEY,
            });
        },
    });
};
