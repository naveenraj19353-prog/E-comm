import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import PageLoader from "../../components/PageLoader";
import { clearTenant, setTenant, setTenantSlug } from "./tenantSlice";
import { getStorefrontLayout, getTenantBySlug } from "../admin/api/tenant.api";

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

    const layoutQuery = useQuery({
        queryKey: ["storefront-layout", slug],
        queryFn: () => getStorefrontLayout(slug),
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

    useEffect(() => {
        if (!tenantQuery.data || !layoutQuery.data) {
            return;
        }
        const tenant = {
            ...tenantQuery.data,
            storefrontLayout: {
                theme: layoutQuery.data.theme,
                themeColors: layoutQuery.data.themeColors,
                layoutSettings: layoutQuery.data.layoutSettings,
                footerContent: layoutQuery.data.footerContent,
                isCustomized: layoutQuery.data.isCustomized,
                source: layoutQuery.data.source,
            },
        };
        dispatch(setTenant(tenant));
        localStorage.setItem("ecommerce_tenantId", tenant.tenantId);
        localStorage.setItem("ecommerce_tenantSlug", tenant.slug);
    }, [tenantQuery.data, layoutQuery.data, dispatch]);

    if (!slug) {
        return <h1>Store not found</h1>;
    }

    if (tenantQuery.isLoading || layoutQuery.isLoading || !currentTenant) {
        return <PageLoader message="Loading store layout..." fullViewport />;
    }

    if (tenantQuery.isError || layoutQuery.isError) {
        return <h1>Store not found</h1>;
    }

    return <Outlet />;
};

export default TenantLoader;
