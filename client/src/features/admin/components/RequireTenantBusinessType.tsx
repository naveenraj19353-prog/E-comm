import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { BusinessType } from "../../../constants/businessTypes";
import { useTenantByTenantId } from "../hooks/useTenants";

type Props = {
    allowed: BusinessType[];
    children: ReactNode;
};

export default function RequireTenantBusinessType({
    allowed,
    children,
}: Props) {
    const { tenantId = "" } = useParams();
    const { data: tenant, isLoading, isError } =
        useTenantByTenantId(tenantId);

    if (isLoading) {
        return <div>Loading tenant...</div>;
    }

    if (isError || !tenant) {
        return <Navigate to="/admin/tenants" replace />;
    }

    const businessType = tenant.businessType || "retail";
    if (!allowed.includes(businessType)) {
        return (
            <Navigate
                to={`/admin/tenants/${tenant.tenantId}`}
                replace
            />
        );
    }

    return children;
}
