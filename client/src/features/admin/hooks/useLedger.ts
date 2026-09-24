import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createPayout,
    getLedgerOverview,
    getLedgerPayouts,
    getLedgerStatement,
    syncDeliveryCharge,
    updateCommission,
    type CreatePayoutPayload,
    type DateRangeParams,
    type UpdateCommissionPayload,
} from "../api/ledger.api";

export const LEDGER_STATEMENT_QUERY_KEY = ["ledger", "statement"];
export const LEDGER_PAYOUTS_QUERY_KEY = ["ledger", "payouts"];
export const LEDGER_OVERVIEW_QUERY_KEY = ["ledger", "overview"];

export const useLedgerStatement = (
    tenantId: string,
    page = 1,
    pageSize = 25,
    dateRange: DateRangeParams = {},
) => {
    return useQuery({
        queryKey: [
            ...LEDGER_STATEMENT_QUERY_KEY,
            tenantId,
            page,
            pageSize,
            dateRange.fromDate || "",
            dateRange.toDate || "",
        ],
        queryFn: () => getLedgerStatement(tenantId, page, pageSize, dateRange),
        enabled: Boolean(tenantId),
    });
};

export const useLedgerPayouts = (tenantId: string, page = 1, pageSize = 25) => {
    return useQuery({
        queryKey: [...LEDGER_PAYOUTS_QUERY_KEY, tenantId, page, pageSize],
        queryFn: () => getLedgerPayouts(tenantId, page, pageSize),
        enabled: Boolean(tenantId),
    });
};

export const useLedgerOverview = (page = 1, pageSize = 25, dateRange: DateRangeParams = {}) => {
    return useQuery({
        queryKey: [
            ...LEDGER_OVERVIEW_QUERY_KEY,
            page,
            pageSize,
            dateRange.fromDate || "",
            dateRange.toDate || "",
        ],
        queryFn: () => getLedgerOverview(page, pageSize, dateRange),
    });
};

export const useRecordPayout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreatePayoutPayload) => createPayout(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: LEDGER_STATEMENT_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: LEDGER_PAYOUTS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: LEDGER_OVERVIEW_QUERY_KEY });
        },
    });
};

export const useUpdateCommission = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: UpdateCommissionPayload) => updateCommission(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: LEDGER_STATEMENT_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: LEDGER_OVERVIEW_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ["tenant"] });
        },
    });
};

export const useSyncDeliveryCharge = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ orderId, tenantId }: { orderId: string; tenantId?: string }) =>
            syncDeliveryCharge(orderId, tenantId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: LEDGER_STATEMENT_QUERY_KEY });
        },
    });
};
