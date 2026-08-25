import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { clearTenant, setTenant, setTenantSlug } from "./tenantSlice";
import { getTenantBySlug } from "../admin/api/tenant.api";
const TenantLoader = () => {
    const { tenantSlug } = useParams();
    const dispatch = useAppDispatch();
    const currentTenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = tenantSlug?.trim().toLowerCase() || "";
    const tenantQuery = useQuery({
        queryKey: ["tenant", "slug", slug],
        queryFn: () => getTenantBySlug(slug),
        enabled: Boolean(slug),
        retry: false,
    });
    useEffect(() => {
        if (!slug) {
            dispatch(clearTenant());
            return;
        }
        dispatch(setTenantSlug(slug));
        localStorage.setItem("ecommerce_tenantSlug", slug);
    }, [slug, dispatch]);
    if (tenantQuery.data && currentTenant?.tenantId !== tenantQuery.data.tenantId) {
        dispatch(setTenant(tenantQuery.data));
        localStorage.setItem("ecommerce_tenantId", tenantQuery.data.tenantId);
        localStorage.setItem("ecommerce_tenantSlug", tenantQuery.data.slug);
    }
    if (!slug) {
        return <h1>Store not found</h1>;
    }
    if (tenantQuery.isLoading || !currentTenant) {
        return <h1>Loading store...</h1>;
    }
    if (tenantQuery.isError) {
        return <h1>Store not found</h1>;
    }
    return <Outlet />;
};
export default TenantLoader;
