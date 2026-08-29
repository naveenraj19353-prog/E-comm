import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../../api/client";
import type { BulkProductDraft } from "../utils/bulkProductImport";
import { buildBulkImportPayload } from "../utils/bulkProductImport";

export interface BulkImportResponse {
    success: boolean;
    created: number;
    updated: number;
    failed: number;
    errors: Array<{
        index: number;
        name: string;
        detail: string;
    }>;
}

export const useBulkImportProducts = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            tenantId,
            products,
        }: {
            tenantId: string;
            products: BulkProductDraft[];
        }) => {
            const payload = buildBulkImportPayload(tenantId, products);
            const response = await apiClient.post<BulkImportResponse>(
                "/product/bulk-import",
                payload,
            );
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["admin-products", variables.tenantId],
            });
            queryClient.invalidateQueries({
                queryKey: ["tenant-products", variables.tenantId],
            });
        },
    });
};
