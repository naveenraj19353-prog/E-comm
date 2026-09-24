import { useAuth } from "./hooks/useAuth";
import { hasStorePermission } from "./permissions";
import { isStoreStaff } from "./roles";
import { useStorefrontTenant } from "../tenant/useTenant";

/** Uses the admin-panel session, which stays separate from the storefront shopper session. */
export const useCanManageStoreLayout = (): boolean => {
    const { staffUser } = useAuth();
    const { tenantId } = useStorefrontTenant();
    return Boolean(
        staffUser &&
        (staffUser.role === "super_admin" ||
            (isStoreStaff(staffUser.role) &&
                staffUser.tenantId === tenantId &&
                hasStorePermission(staffUser, "layout"))),
    );
};
