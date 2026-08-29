import { useAuth } from "./hooks/useAuth";
import { useStorefrontTenant } from "../tenant/useTenant";

export const useCanManageStoreLayout = (): boolean => {
    const { isAuthenticated, user } = useAuth();
    const { tenantId } = useStorefrontTenant();
    return Boolean(
        isAuthenticated &&
        user &&
        (user.role === "super_admin" ||
            (user.role === "admin" && user.tenantId === tenantId)),
    );
};
