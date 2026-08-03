import { useApiQuery } from "../../../hooks/useApiQuery";
import { getWishlists } from "../api/wishlist.api";

export const useWishlists = (tenantId: string, userId: string) =>
  useApiQuery(["products", tenantId], () => getWishlists(tenantId, userId), {
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
