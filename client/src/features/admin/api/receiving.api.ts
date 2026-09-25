import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

/** One incoming line: an existing variantId, or a colour + size for a new variant. */
export type ReceivingLine = {
    variantId?: string;
    color?: string;
    size?: string;
    incomingStock: number;
};

export type ReceivingPreviewPayload = {
    tenantId: string;
    productId?: string;
    name?: string;
    categoryId?: string;
    categoryName?: string;
    brand?: string;
    variants: ReceivingLine[];
};

export type ReceivingPreviewVariant = {
    variantId: string | null;
    proposedVariantId: string | null;
    color: string | null;
    size: string | null;
    matchedBy: "variant_id" | "color_size" | "new";
    existingStock: number;
    incomingStock: number;
    finalStock: number;
    action: "ADD_TO_EXISTING_VARIANT" | "CREATE_NEW_VARIANT";
};

export type ReceivingPreview = {
    action: "NEW_PRODUCT" | "EXISTING_PRODUCT";
    matchType: "explicit_product_id" | "variant_id" | "candidate" | "none";
    matchReason: string;
    requiresConfirmation: boolean;
    product: {
        id: string | null;
        name: string | null;
        categoryId: string | null;
        categoryName: string | null;
        isActive?: boolean | null;
        isDraft?: boolean | null;
    };
    category: { categoryId: string | null; categoryName: string | null; status: "existing" | "new_to_store" };
    variants: ReceivingPreviewVariant[];
    totals: { existingStock: number; incomingStock: number; finalStock: number };
    warnings: string[];
    /** Signed reference for the commit. null for a "candidate" match. */
    previewToken: string | null;
    expiresAt: string | null;
};

/** The only fields the commit accepts: amounts always come from the signed preview. */
export type ReceivingCommitPayload = {
    previewToken: string;
    confirm: boolean;
    note?: string;
};

export type ReceivingCommitVariant = {
    variantId: string;
    color: string | null;
    size: string | null;
    beforeStock: number;
    receivedStock: number;
    afterStock: number;
    action: "STOCK_INCREASED" | "VARIANT_CREATED" | "UNCHANGED";
};

export type ReceivingCommitResult = {
    success: boolean;
    receivingId: string;
    productId: string;
    action: "EXISTING_PRODUCT" | "PRODUCT_CREATED";
    replayed: boolean;
    variants: ReceivingCommitVariant[];
    totals: { beforeStock: number; receivedStock: number; afterStock: number };
};

/** The product fields the receiving flow reads (the admin Product type fits). */
export type ReceivingProduct = {
    _id?: string;
    id?: string;
    name: string;
    categoryId?: string;
    categoryName?: string;
    isActive?: boolean;
    isDraft?: boolean;
    inventory?: Array<{ variantId?: string; color?: string; size?: string; stock?: number }>;
};

export const productIdOf = (product: ReceivingProduct): string => product._id || product.id || "";

export async function previewReceiving(payload: ReceivingPreviewPayload): Promise<ReceivingPreview> {
    const response = await apiClient.post(API_ENDPOINTS.INVENTORY.RECEIVING_PREVIEW, payload);
    return response.data;
}

export async function commitReceiving({ previewToken, confirm, note }: ReceivingCommitPayload): Promise<ReceivingCommitResult> {
    // Built field by field so nothing else (e.g. stock values) can ever be sent.
    const body: ReceivingCommitPayload = { previewToken, confirm };
    const trimmedNote = note?.trim();
    if (trimmedNote) {
        body.note = trimmedNote;
    }
    const response = await apiClient.post(API_ENDPOINTS.INVENTORY.RECEIVING_COMMIT, body);
    return response.data;
}

/** Product picker search. Includes drafts/inactive products, which can also receive stock. */
export async function searchReceivingProducts(tenantId: string, search: string): Promise<ReceivingProduct[]> {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.GET_ALL, {
        params: { tenantId, search: search || undefined, includeInactive: true, page: 1, limit: 20 },
    });
    return response.data?.data ?? [];
}

export type ReceivingErrorKind =
    | "stale"
    | "variant_conflict"
    | "confirmation_required"
    | "permission"
    | "validation"
    | "network"
    | "other";

export type ReceivingError = { kind: ReceivingErrorKind; message: string };

type ErrorBody = { detail?: unknown };

/** Turn an API error into something the admin can act on. */
export function receivingError(error: unknown): ReceivingError {
    const response = (error as { response?: { status?: number; data?: ErrorBody } })?.response;
    if (!response) {
        return {
            kind: "network",
            message: "Couldn't reach the server. Retrying is safe: stock is never added twice for the same preview.",
        };
    }
    const detail = response.data?.detail;
    const code = typeof detail === "object" && detail && "code" in detail ? String((detail as { code: unknown }).code) : "";
    const detailMessage =
        typeof detail === "object" && detail && "message" in detail ? String((detail as { message: unknown }).message) : "";

    if (code === "RECEIVING_PREVIEW_STALE") {
        return { kind: "stale", message: detailMessage || "Stock changed after preview. Refresh the preview before saving." };
    }
    if (code === "RECEIVING_PREVIEW_EXPIRED" || code === "INVALID_PREVIEW_TOKEN") {
        return { kind: "stale", message: detailMessage || "This preview is no longer valid. Refresh the preview before saving." };
    }
    if (code === "VARIANT_ID_CONFLICT") {
        return {
            kind: "variant_conflict",
            message: `${detailMessage || "A generated SKU clashes with another variant of this product."} Change the colour or size name and preview again.`,
        };
    }
    if (code === "CONFIRMATION_REQUIRED") {
        return { kind: "confirmation_required", message: detailMessage || "Please confirm this receiving before saving." };
    }
    if (response.status === 403) {
        return { kind: "permission", message: "You don't have permission to receive stock." };
    }
    if (response.status === 422 && Array.isArray(detail)) {
        const first = detail[0] as { msg?: string } | undefined;
        return { kind: "validation", message: first?.msg ? `Please check the quantities: ${first.msg}.` : "Please check the quantities." };
    }
    if (typeof detail === "string") {
        return { kind: response.status === 400 || response.status === 404 ? "validation" : "other", message: detail };
    }
    if (detailMessage) {
        return { kind: "other", message: detailMessage };
    }
    return { kind: "other", message: "Something went wrong. Please try again." };
}
