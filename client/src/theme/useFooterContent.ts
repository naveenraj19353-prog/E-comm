import { useMemo } from "react";
import { useAppSelector } from "../app/hooks";
import type { FooterContent } from "../components/Footer/types";
import { resolveThemeDraft } from "./resolveTheme";

export const useFooterContent = (): FooterContent => {
    const tenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = useAppSelector((state) => state.tenant.tenantSlug);
    const livePreview = useAppSelector((state) => state.themeCustomizer.livePreview);
    const revision = useAppSelector((state) => state.themeCustomizer.revision);
    return useMemo(
        () => resolveThemeDraft(tenant, slug, livePreview).footerContent,
        [tenant, slug, livePreview, revision],
    );
};
