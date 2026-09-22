import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import PageLoader from "../../components/PageLoader";
import { clearTenant, setTenant, setTenantSlug } from "./tenantSlice";
import { getTenantSlugFromHostname } from "./tenantHost";
import { getTenantBySlug } from "../admin/api/tenant.api";
import { StorefrontAuthModalProvider } from "./StorefrontAuthModal";
import type { Tenant } from "../../types/tenant";

const TenantLoader = () => {
    const { tenantSlug: paramSlug } = useParams();
    const dispatch = useAppDispatch();
    const currentTenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = (paramSlug || getTenantSlugFromHostname() || "").trim().toLowerCase();

    // Single request — /tenants/slug/:slug already includes storefrontLayout.
    const tenantQuery = useQuery({
        queryKey: ["tenant", "slug", slug],
        queryFn: () => getTenantBySlug(slug),
        enabled: Boolean(slug),
        retry: false,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: true,
    });

    useEffect(() => {
        if (!slug) {
            dispatch(clearTenant());
            return;
        }
        dispatch(setTenantSlug(slug));
        localStorage.setItem("ecommerce_tenantSlug", slug);
    }, [slug, dispatch]);

    useEffect(() => {
        if (!tenantQuery.data) {
            return;
        }
        const data = tenantQuery.data as Tenant;
        const layout = data.storefrontLayout;
        const tenant: Tenant = {
            ...data,
            storefrontLayout: layout
                ? {
                    theme: layout.theme,
                    themeColors: layout.themeColors,
                    layoutSettings: layout.layoutSettings,
                    footerContent: layout.footerContent,
                    isCustomized: layout.isCustomized,
                    source: layout.source,
                }
                : null,
        };
        dispatch(setTenant(tenant));
        localStorage.setItem("ecommerce_tenantId", tenant.tenantId);
        localStorage.setItem("ecommerce_tenantSlug", tenant.slug);
    }, [tenantQuery.data, dispatch]);

    if (!slug) {
        return <h1>Store not found</h1>;
    }

    if (tenantQuery.isError) {
        return <h1>Store not found</h1>;
    }

    if (tenantQuery.isLoading || !currentTenant) {
        return <PageLoader message="Loading store layout..." fullViewport />;
    }

    return (
        <StorefrontAuthModalProvider>
            <Outlet />
        </StorefrontAuthModalProvider>
    );
};

export default TenantLoader;
