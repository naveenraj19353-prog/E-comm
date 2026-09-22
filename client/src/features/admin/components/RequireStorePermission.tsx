import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import {
    hasAnyStorePermission,
    hasStorePermission,
    type StorePermission,
} from "../../auth/permissions";

type Props = {
    permission?: StorePermission;
    anyOf?: StorePermission[];
    children: ReactNode;
};

export default function RequireStorePermission({
    permission,
    anyOf,
    children,
}: Props) {
    const { tenantId = "" } = useParams();
    const { user } = useAuth();
    const allowed = anyOf?.length
        ? hasAnyStorePermission(user, anyOf)
        : permission
            ? hasStorePermission(user, permission)
            : true;
    if (!allowed) {
        return <Navigate to={`/admin/tenants/${tenantId}`} replace />;
    }
    return children;
}
