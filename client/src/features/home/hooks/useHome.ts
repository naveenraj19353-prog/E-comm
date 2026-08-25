import { useQuery } from "@tanstack/react-query";
import { getHome } from "../api/home.api";
export const useHome = (tenantId: string) => {
    return useQuery({
        queryKey: ["home", tenantId],
        queryFn: async () => {
            const response = await getHome(tenantId);
            return response.data;
        },
        enabled: Boolean(tenantId),
        staleTime: 30 * 1000,
    });
};
