import { useMemo } from "react";
import { useAppSelector } from "../app/hooks";
import type { LayoutSettings } from "./types";
import { resolveThemeDraft } from "./resolveTheme";

export const useLayoutSettings = (): LayoutSettings => {
    const tenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = useAppSelector((state) => state.tenant.tenantSlug);
    const livePreview = useAppSelector((state) => state.themeCustomizer.livePreview);
    const revision = useAppSelector((state) => state.themeCustomizer.revision);
    return useMemo(
        () => resolveThemeDraft(tenant, slug, livePreview).layoutSettings,
        [tenant, slug, livePreview, revision],
    );
};
