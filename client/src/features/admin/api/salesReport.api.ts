import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type SalesGroupBy = "day" | "week" | "month";

export type SalesReport = {
    from: string;
    to: string;
    groupBy: SalesGroupBy;
    totals: {
        orders: number;
        ordersPlaced: number;
        cancelled: number;
        netSales: number;
        refunded: number;
        averageOrderValue: number;
    };
    series: Array<{ period: string; orders: number; netSales: number }>;
    statusCounts: Record<string, number>;
    topProducts: Array<{ productId: string; name: string; units: number; sales: number }>;
};

export type SalesReportParams = {
    from?: string;
    to?: string;
    groupBy?: SalesGroupBy;
};

export async function getSalesReport(tenantId: string, params: SalesReportParams): Promise<SalesReport> {
    const response = await apiClient.get(API_ENDPOINTS.ORDERS.ADMIN_ANALYTICS, {
        params: {
            tenantId,
            ...params,
            // Minutes east of UTC, so days are this browser's local days (India = 330).
            tzOffset: -new Date().getTimezoneOffset(),
        },
    });
    return response.data.data as SalesReport;
}
