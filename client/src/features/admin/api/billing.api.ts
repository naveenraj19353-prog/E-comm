import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import { formatOrderAmount } from "../../orders/api/order.api";

export type BillingStatusValue = "exempt" | "trialing" | "active" | "past_due" | "suspended";

export interface BillingStatus {
    tenantId: string;
    status: BillingStatusValue;
    isOperational: boolean;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    graceEndsAt: string | null;
    currentPeriodEnd: string | null;
    autopaySetUp: boolean;
    cancelledAt: string | null;
    priceInr: number;
    billingConfigured: boolean;
}

export interface BillingStatusResponse {
    success: boolean;
    data: BillingStatus;
}

export interface BillingSubscription {
    subscriptionId: string;
    shortUrl: string;
    status: string;
}

export interface BillingSubscriptionResponse {
    success: boolean;
    data: BillingSubscription;
}

export interface SetBillingExemptPayload {
    tenantId: string;
    exempt: boolean;
}

export interface BillingOverviewRow extends BillingStatus {
    name: string;
    slug: string;
}

export interface BillingOverview {
    rows: BillingOverviewRow[];
    page: number;
    pageSize: number;
    total: number;
}

export interface BillingOverviewResponse {
    success: boolean;
    data: BillingOverview;
}

export const getBillingStatus = async (tenantId?: string): Promise<BillingStatus> => {
    const response = await apiClient.get<BillingStatusResponse>(
        API_ENDPOINTS.BILLING.STATUS,
        { params: { tenantId: tenantId || undefined } },
    );
    return response.data.data;
};

export const subscribe = async (tenantId?: string): Promise<BillingSubscription> => {
    const response = await apiClient.post<BillingSubscriptionResponse>(
        API_ENDPOINTS.BILLING.SUBSCRIBE,
        undefined,
        { params: { tenantId: tenantId || undefined } },
    );
    return response.data.data;
};

export const setBillingExempt = async (
    tenantId: string,
    exempt: boolean,
): Promise<BillingStatus> => {
    const payload: SetBillingExemptPayload = { tenantId, exempt };
    const response = await apiClient.patch<BillingStatusResponse>(
        API_ENDPOINTS.BILLING.EXEMPT,
        payload,
    );
    return response.data.data;
};

export const getBillingOverview = async (
    page = 1,
    pageSize = 25,
): Promise<BillingOverview> => {
    const response = await apiClient.get<BillingOverviewResponse>(
        API_ENDPOINTS.BILLING.OVERVIEW,
        { params: { page, pageSize } },
    );
    return response.data.data;
};

export const BILLING_STATUS_LABELS: Record<BillingStatusValue, string> = {
    exempt: "Exempt",
    trialing: "Free trial",
    active: "Active",
    past_due: "Payment due",
    suspended: "Suspended",
};

/** "₹499/month" — whole-rupee prices drop the ".00". */
export const formatBillingPrice = (priceInr?: number): string =>
    `${formatOrderAmount(priceInr).replace(/\.00$/, "")}/month`;

/** "42 days left", "1 day left", "last day". */
export const formatTrialDaysLeft = (days?: number | null): string => {
    if (days === null || days === undefined) {
        return "";
    }
    if (days <= 0) {
        return "last day";
    }
    return `${days} day${days === 1 ? "" : "s"} left`;
};
