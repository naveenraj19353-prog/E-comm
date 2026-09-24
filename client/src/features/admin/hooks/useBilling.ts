import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getBillingOverview,
    getBillingStatus,
    setBillingExempt,
    subscribe,
    type SetBillingExemptPayload,
} from "../api/billing.api";

export const BILLING_STATUS_QUERY_KEY = ["billing", "status"];
export const BILLING_OVERVIEW_QUERY_KEY = ["billing", "overview"];

export const useBillingStatus = (tenantId = "", enabled = true) => {
    return useQuery({
        queryKey: [...BILLING_STATUS_QUERY_KEY, tenantId],
        queryFn: () => getBillingStatus(tenantId),
        enabled,
    });
};

export const useBillingOverview = (page = 1, pageSize = 25) => {
    return useQuery({
        queryKey: [...BILLING_OVERVIEW_QUERY_KEY, page, pageSize],
        queryFn: () => getBillingOverview(page, pageSize),
    });
};

export const useSubscribe = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (tenantId?: string) => subscribe(tenantId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_KEY });
        },
    });
};

export const useSetBillingExempt = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, exempt }: SetBillingExemptPayload) =>
            setBillingExempt(tenantId, exempt),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: BILLING_OVERVIEW_QUERY_KEY });
        },
    });
};
