import type { Tenant } from "../types/type";

interface TenantViewer {
    role?: string;
    tenantId?: string | null;
}

export const getVisibleTenants = (
    tenants: Tenant[],
    user?: TenantViewer | null,
): Tenant[] => {
    if (user?.role === "admin" && user?.tenantId) {
        return tenants.filter((tenant) => tenant.tenantId === user?.tenantId);
    }
    return tenants;
};
