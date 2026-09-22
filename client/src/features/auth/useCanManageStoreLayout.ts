import { useAuth } from "./hooks/useAuth";
import { hasStorePermission } from "./permissions";
import { isStoreStaff } from "./roles";
import { useStorefrontTenant } from "../tenant/useTenant";

export const useCanManageStoreLayout = (): boolean => {
    const { isAuthenticated, user } = useAuth();
    const { tenantId } = useStorefrontTenant();
    return Boolean(
        isAuthenticated &&
        user &&
        (user?.role === "super_admin" ||
            (isStoreStaff(user?.role) &&
                user?.tenantId === tenantId &&
                hasStorePermission(user, "layout"))),
    );
};
