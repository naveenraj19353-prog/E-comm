import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

/** GST status of a product. These are distinct lines on a GST return. */
export type TaxStatus = "taxable" | "exempt" | "nil_rated" | "non_gst";

export interface ProductTaxConfig {
    hsnSac?: string | null;
    /** null means "fall back to the store's default rate". */
    taxRate?: number | null;
    cessRate?: number;
    taxStatus?: TaxStatus;
}

/** The store's GST registration and invoice defaults. */
export interface TaxProfile {
    tenantId: string;
    /** Master switch. Off means checkout is unchanged and tax is zero. */
    enabled: boolean;
    legalName: string;
    gstin: string;
    registeredAddress: string;
    state: string;
    stateCode: string;
    invoicePrefix: string;
    priceIncludesTax: boolean;
    defaultTaxRate: number;
    shippingTaxRate: number;
    reverseCharge: boolean;
}

export interface IssuedInvoice {
    _id?: string;
    invoiceNumber: string;
    financialYear: string;
    issuedAt: string;
    status: string;
    orderNumber?: number;
    totalAmount?: number;
    supplier?: Record<string, unknown>;
    recipient?: Record<string, unknown>;
    tax?: Record<string, unknown>;
}

export interface CreditNote {
    _id?: string;
    creditNoteNumber: string;
    invoiceNumber: string;
    amount: number;
    reason: string;
    issuedAt: string;
}

export const emptyTaxProfile = (tenantId: string): TaxProfile => ({
    tenantId,
    enabled: false,
    legalName: "",
    gstin: "",
    registeredAddress: "",
    state: "",
    stateCode: "",
    invoicePrefix: "INV",
    priceIncludesTax: true,
    defaultTaxRate: 0,
    shippingTaxRate: 0,
    reverseCharge: false,
});

export async function getTaxProfile(tenantId: string): Promise<TaxProfile> {
    const response = await apiClient.get(API_ENDPOINTS.TAX.PROFILE, {
        params: { tenantId },
    });
    // Spread over the empty profile so a store that has never saved one still
    // yields a complete, editable object.
    return { ...emptyTaxProfile(tenantId), ...response.data };
}

export async function saveTaxProfile(profile: TaxProfile): Promise<TaxProfile> {
    const response = await apiClient.put(API_ENDPOINTS.TAX.PROFILE, profile);
    return response.data.profile;
}

export async function issueInvoice(orderId: string): Promise<IssuedInvoice> {
    const response = await apiClient.post(API_ENDPOINTS.TAX.issueInvoice(orderId), {});
    return response.data;
}

export async function getAdminInvoice(orderId: string): Promise<IssuedInvoice | { issued: false }> {
    const response = await apiClient.get(API_ENDPOINTS.TAX.adminInvoice(orderId));
    return response.data;
}

export async function createCreditNote(
    orderId: string,
    reason: string,
    amount?: number,
): Promise<CreditNote> {
    const response = await apiClient.post(API_ENDPOINTS.TAX.creditNotes(orderId), {
        reason,
        ...(amount ? { amount } : {}),
    });
    return response.data;
}

export async function listCreditNotes(orderId: string): Promise<CreditNote[]> {
    const response = await apiClient.get(API_ENDPOINTS.TAX.creditNotes(orderId));
    return response.data;
}
