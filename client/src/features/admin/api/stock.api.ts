import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

/** Where a stock change came from (see app/services/stock_movements.py). */
export type StockMovementSource =
    | "manual_adjustment"
    | "product_edit"
    | "order_placed"
    | "checkout_reserved"
    | "reservation_released"
    | "order_cancelled"
    | "return_received"
    | "other";

export type StockMovement = {
    id: string;
    productId: string | null;
    productName?: string | null;
    variantId: string;
    color?: string | null;
    size?: string | null;
    change: number;
    stockAfter: number | null;
    source: StockMovementSource;
    reason?: string | null;
    reasonLabel?: string | null;
    note?: string | null;
    orderId?: string | null;
    userName?: string | null;
    createdAt: string;
};

export type StockMovementsResponse = {
    reasons: Record<string, string>;
    data: StockMovement[];
};

export type StockAdjustmentPayload = {
    tenantId: string;
    variantId: string;
    change: number;
    reason: string;
    note?: string;
};

export type StockAdjustmentResult = {
    variantId: string;
    stock: number;
    totalStock: number;
};

export const STOCK_SOURCE_LABELS: Record<StockMovementSource, string> = {
    manual_adjustment: "Adjusted",
    product_edit: "Product edit",
    order_placed: "Order placed",
    checkout_reserved: "Held for online payment",
    reservation_released: "Unpaid checkout released",
    order_cancelled: "Order cancelled",
    return_received: "Return received",
    other: "Other",
};

export async function getStockMovements(
    productId: string,
    tenantId: string,
    limit = 50,
): Promise<StockMovementsResponse> {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.stockMovements(productId), {
        params: { tenantId, limit },
    });
    return {
        reasons: response.data?.reasons ?? {},
        data: response.data?.data ?? [],
    };
}

export async function adjustStock(
    productId: string,
    payload: StockAdjustmentPayload,
): Promise<StockAdjustmentResult> {
    const response = await apiClient.post(
        API_ENDPOINTS.PRODUCT.stockAdjustments(productId),
        payload,
    );
    return {
        variantId: response.data?.variantId,
        stock: response.data?.stock ?? 0,
        totalStock: response.data?.totalStock ?? 0,
    };
}

/** Matches DEFAULT_LOW_STOCK_THRESHOLD in app/services/low_stock.py. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export const lowStockThresholdOf = (tenant?: { lowStockThreshold?: number | null } | null): number => {
    const value = tenant?.lowStockThreshold;
    return typeof value === "number" && value >= 0 ? value : DEFAULT_LOW_STOCK_THRESHOLD;
};

export type LowStockItem = {
    productId: string;
    name: string;
    lowestStock: number;
    variants: Array<{ variantId: string; color?: string | null; size?: string | null; stock: number }>;
};

export type LowStockResponse = {
    threshold: number;
    count: number;
    outOfStock: number;
    data: LowStockItem[];
};

export async function getLowStock(tenantId: string): Promise<LowStockResponse> {
    const response = await apiClient.get(API_ENDPOINTS.PRODUCT.LOW_STOCK, { params: { tenantId } });
    const body = response.data || {};
    return {
        threshold: body.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
        count: body.count ?? 0,
        outOfStock: body.outOfStock ?? 0,
        data: body.data ?? [],
    };
}
