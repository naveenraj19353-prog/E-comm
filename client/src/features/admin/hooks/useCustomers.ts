import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAdminCustomers } from "../api/customer.api";

export const ADMIN_CUSTOMERS_QUERY_KEY = ["admin", "customers"];

export const useAdminCustomers = (
    tenantId: string,
    page = 1,
    pageSize = 25,
    search = "",
) => {
    return useQuery({
        queryKey: [...ADMIN_CUSTOMERS_QUERY_KEY, tenantId, page, pageSize, search],
        queryFn: () => getAdminCustomers(tenantId, page, pageSize, search),
        enabled: Boolean(tenantId),
        placeholderData: keepPreviousData,
        refetchInterval: 10000,
    });
};
