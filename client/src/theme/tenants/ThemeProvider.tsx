import { useEffect, useMemo } from "react";
import { useAppSelector } from "../../app/hooks";
import { applyThemeToDocument, resolveThemeDraft } from "../resolveTheme";

interface Props {
    children: React.ReactNode;
}

const ThemeProvider = ({ children }: Props) => {
    const tenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = useAppSelector((state) => state.tenant.tenantSlug);
    const livePreview = useAppSelector((state) => state.themeCustomizer.livePreview);
    const revision = useAppSelector((state) => state.themeCustomizer.revision);
    const draft = useMemo(
        () => resolveThemeDraft(tenant, slug, livePreview),
        [tenant, slug, livePreview, revision],
    );

    useEffect(() => {
        applyThemeToDocument(draft);
    }, [draft]);

    return <>{children}</>;
};

export default ThemeProvider;
