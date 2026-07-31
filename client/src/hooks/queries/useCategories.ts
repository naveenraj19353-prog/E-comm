import { useQuery } from "@tanstack/react-query";
import { getCategories } from "../../services/categoryService";

export const useCategories = (tenantId: string) => {
  return useQuery({
    queryKey: ["categories", tenantId],
    queryFn: () => getCategories(tenantId),
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  });
};