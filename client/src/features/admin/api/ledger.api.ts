import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type LedgerEntryStatus = "pending" | "refunded";

export interface LedgerEntry {
    _id: string;
    tenantId: string;
    orderId: string;
    orderNumber?: number | null;
    orderRef?: string;
    razorpayPaymentId: string;
    grossAmount: number;
    refundedAmount: number;
    commissionPercent: number;
    commissionAmount: number;
    gatewayFee: number;
    deliveryCharge: number;
    deliveryChargeSynced: boolean;
    netAmount: number;
    status: LedgerEntryStatus;
    settled: boolean;
    payoutId?: string | null;
    settledNetAmount: number;
    createdAt: string;
    updatedAt: string;
}

export interface LedgerSummary {
    grossAmount: number;
    refundedAmount: number;
    commissionAmount: number;
    gatewayFee: number;
    deliveryCharge: number;
    netAmount: number;
    totalPaidOut: number;
    balanceDue: number;
}

export interface LedgerStatement {
    entries: LedgerEntry[];
    page: number;
    pageSize: number;
    total: number;
    summary: LedgerSummary;
}

export interface LedgerStatementResponse {
    success: boolean;
    data: LedgerStatement;
}

export interface Payout {
    _id: string;
    tenantId: string;
    amount: number;
    note?: string | null;
    recordedBy?: string | null;
    recordedByName?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    entryCount: number;
    createdAt: string;
}

export interface LedgerPayouts {
    payouts: Payout[];
    page: number;
    pageSize: number;
    total: number;
}

export interface LedgerPayoutsResponse {
    success: boolean;
    data: LedgerPayouts;
}

export interface DateRangeParams {
    fromDate?: string;
    toDate?: string;
}

export interface CreatePayoutPayload extends DateRangeParams {
    tenantId: string;
    note?: string;
}

export interface PayoutResponse {
    success: boolean;
    message: string;
    data: Payout;
}

export interface UpdateCommissionPayload {
    tenantId: string;
    platformCommissionPercent: number | null;
}

export interface UpdateCommissionResponse {
    success: boolean;
    message: string;
}

export interface LedgerOverviewRow {
    tenantId: string;
    name: string;
    slug: string;
    commissionPercent: number;
    grossAmount: number;
    refundedAmount: number;
    commissionAmount: number;
    gatewayFee: number;
    deliveryCharge: number;
    netAmount: number;
    totalPaidOut: number;
    balanceDue: number;
}

export interface LedgerOverview {
    rows: LedgerOverviewRow[];
    page: number;
    pageSize: number;
    total: number;
}

export interface LedgerOverviewResponse {
    success: boolean;
    data: LedgerOverview;
}

export interface SyncDeliveryChargeResponse {
    success: boolean;
    message: string;
    updated: boolean;
}

export const getLedgerStatement = async (
    tenantId: string,
    page = 1,
    pageSize = 25,
    dateRange: DateRangeParams = {},
): Promise<LedgerStatement> => {
    const response = await apiClient.get<LedgerStatementResponse>(
        API_ENDPOINTS.LEDGER.STATEMENT,
        {
            params: {
                tenantId: tenantId || undefined,
                page,
                pageSize,
                fromDate: dateRange.fromDate || undefined,
                toDate: dateRange.toDate || undefined,
            },
        },
    );
    return response.data.data;
};

export const getLedgerPayouts = async (
    tenantId: string,
    page = 1,
    pageSize = 25,
): Promise<LedgerPayouts> => {
    const response = await apiClient.get<LedgerPayoutsResponse>(
        API_ENDPOINTS.LEDGER.PAYOUTS,
        { params: { tenantId: tenantId || undefined, page, pageSize } },
    );
    return response.data.data;
};

export const createPayout = async (payload: CreatePayoutPayload): Promise<Payout> => {
    const response = await apiClient.post<PayoutResponse>(
        API_ENDPOINTS.LEDGER.PAYOUTS,
        payload,
    );
    return response.data.data;
};

export const updateCommission = async (
    payload: UpdateCommissionPayload,
): Promise<UpdateCommissionResponse> => {
    const response = await apiClient.patch<UpdateCommissionResponse>(
        API_ENDPOINTS.LEDGER.COMMISSION,
        payload,
    );
    return response.data;
};

export const getLedgerOverview = async (
    page = 1,
    pageSize = 25,
    dateRange: DateRangeParams = {},
): Promise<LedgerOverview> => {
    const response = await apiClient.get<LedgerOverviewResponse>(
        API_ENDPOINTS.LEDGER.OVERVIEW,
        {
            params: {
                page,
                pageSize,
                fromDate: dateRange.fromDate || undefined,
                toDate: dateRange.toDate || undefined,
            },
        },
    );
    return response.data.data;
};

export const syncDeliveryCharge = async (
    orderId: string,
    tenantId?: string,
): Promise<SyncDeliveryChargeResponse> => {
    const response = await apiClient.post<SyncDeliveryChargeResponse>(
        API_ENDPOINTS.LEDGER.syncDeliveryCharge(orderId),
        undefined,
        { params: { tenantId: tenantId || undefined } },
    );
    return response.data;
};
