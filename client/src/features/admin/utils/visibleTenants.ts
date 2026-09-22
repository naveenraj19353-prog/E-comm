import type { Tenant } from "../types/types";
import { isStoreStaff } from "../../auth/roles";

interface TenantViewer {
    role?: string;
    tenantId?: string | null;
}

export const getVisibleTenants = (
    tenants: Tenant[],
    user?: TenantViewer | null,
): Tenant[] => {
    if (isStoreStaff(user?.role) && user?.tenantId) {
        return tenants.filter((tenant) => tenant.tenantId === user?.tenantId);
    }
    return tenants;
};
