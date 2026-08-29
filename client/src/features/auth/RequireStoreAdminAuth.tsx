import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCanManageStoreLayout } from "./useCanManageStoreLayout";

export default function RequireStoreAdminAuth({
    children,
}: {
    children: ReactNode;
}) {
    const location = useLocation();
    const canManageLayout = useCanManageStoreLayout();

    if (!canManageLayout) {
        return (
            <Navigate
                to="/admin/login"
                replace
                state={{
                    from: location.pathname,
                    message: "Store admin login is required to open the layout studio.",
                }}
            />
        );
    }

    return children;
}
