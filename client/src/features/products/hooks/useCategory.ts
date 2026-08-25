import { QUERY_KEYS } from "../../../constants/queryKeys";
import { useApiQuery } from "../../../hooks/useApiQuery";
import { getCategory } from "../api/product.api";
export const useCategory = (tenantId: string) => useApiQuery([QUERY_KEYS.CATEGORIES, tenantId], () => getCategory(tenantId), {
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
});
