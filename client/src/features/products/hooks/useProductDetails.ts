import { useQuery } from "@tanstack/react-query";
import { getProductDetails } from "../api/product.api";
export const useProductDetails = (productId: string, tenantId: string) => {
  return useQuery({
    queryKey: ["product-details", productId, tenantId],
    queryFn: () => getProductDetails(productId, tenantId),
    enabled: Boolean(productId) && Boolean(tenantId),
  });
};
