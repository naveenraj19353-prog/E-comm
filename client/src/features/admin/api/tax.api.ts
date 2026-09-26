import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

/**
 * Store-level GST configuration, stored on `tenant.tax`.
 *
 * Defaults are inert: with `defaultGstRate: 0` and no rates on products or
 * categories, nothing is taxed and no payable changes.
 */
export interface TaxSettingsPayload {
    /** True: listed prices already contain GST. False: GST is added on top. */
    pricesIncludeTax: boolean;
    /** A composition dealer neither collects GST nor passes on input credit. */
    compositionScheme: boolean;
    defaultGstRate: number;
    /** Two-digit GST state code; overrides the state derived from the GSTIN. */
    stateCode: string | null;
    freightTaxable: boolean;
    roundInvoiceToRupee: boolean;
    invoicePrefix?: string | null;
}

export interface CategoryRateRow {
    id: string;
    name: string;
    defaultGstRate: number | null;
}

export const saveTaxSettings = async (
    tenantMongoId: string,
    payload: TaxSettingsPayload,
): Promise<void> => {
    await apiClient.put(API_ENDPOINTS.TENANTS.byId(tenantMongoId), {
        tax: payload,
    });
};

/** Saves one category's rate, leaving every other field untouched. */
export const saveCategoryRate = async (
    categoryId: string,
    tenantId: string,
    defaultGstRate: number | null,
): Promise<void> => {
    await apiClient.put(API_ENDPOINTS.CATEGORIES.byId(categoryId), {
        tenantId,
        defaultGstRate,
    });
};
