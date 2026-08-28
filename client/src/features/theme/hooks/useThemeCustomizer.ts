import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { getStorefrontLayout, updateTenantTheme } from "../../admin/api/tenant.api";
import { setTenant } from "../../tenant/tenantSlice";
import { getStorefrontLayoutSource, resolveThemeDraft } from "../../../theme/resolveTheme";
import { themePresets, THEME_PRESET_NAMES, type ThemePresetName } from "../../../theme/themePresets";
import type { FooterContent } from "../../../components/Footer/types";
import type { LayoutSettings, ThemeColors, ThemeDraft } from "../../../theme/types";
import { DEFAULT_LAYOUT_SETTINGS, DEFAULT_THEME_COLORS, buildDefaultStorefrontLayout } from "../../../theme/types";
import {
    bumpThemeRevision,
    clearLiveThemePreview,
    setLiveThemePreview,
} from "../themeCustomizerSlice";
import {
    clearThemePreviewDraft,
    setThemePreviewDraft,
} from "../../../theme/themeStorage";
import { useCanManageStoreLayout } from "../../auth/useCanManageStoreLayout";

const colorFields: Array<{ key: keyof ThemeColors; label: string }> = [
    { key: "primary", label: "Primary" },
    { key: "secondary", label: "Secondary" },
    { key: "background", label: "Background" },
    { key: "surface", label: "Surface" },
    { key: "border", label: "Border" },
    { key: "textBlack", label: "Text" },
];

export const useThemeCustomizer = () => {
    const dispatch = useAppDispatch();
    const queryClient = useQueryClient();
    const tenant = useAppSelector((state) => state.tenant.currentTenant);
    const slug = useAppSelector((state) => state.tenant.tenantSlug);
    const canSaveForStore = useCanManageStoreLayout();
    const layoutSource = getStorefrontLayoutSource(tenant);
    const baseDraft = useMemo(() => resolveThemeDraft(tenant, slug), [tenant, slug]);
    const [draft, setDraft] = useState<ThemeDraft>(baseDraft);
    const [activeTab, setActiveTab] = useState<"colors" | "home" | "catalog" | "components" | "chrome" | "footer">("home");
    const [previewTab, setPreviewTab] = useState<"home" | "products" | "detail" | "cart" | "wishlist">("home");
    const [statusMessage, setStatusMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDraft(baseDraft);
    }, [baseDraft]);

    useEffect(() => {
        dispatch(setLiveThemePreview({
            theme: draft.theme,
            themeColors: draft.themeColors,
            layoutSettings: draft.layoutSettings,
            footerContent: draft.footerContent,
        }));
        return () => {
            dispatch(clearLiveThemePreview());
        };
    }, [draft, dispatch]);

    const applyPreset = useCallback((preset: ThemePresetName) => {
        setDraft((current) => ({
            ...current,
            theme: preset,
            themeColors: {
                ...current.themeColors,
                ...themePresets[preset],
            },
        }));
    }, []);

    const updateColor = useCallback((key: keyof ThemeColors, value: string) => {
        setDraft((current) => ({
            ...current,
            themeColors: {
                ...current.themeColors,
                [key]: value,
            },
        }));
    }, []);

    const updateLayout = useCallback(<K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) => {
        setDraft((current) => ({
            ...current,
            layoutSettings: {
                ...current.layoutSettings,
                [key]: value,
            },
        }));
    }, []);

    const updateFooterContent = useCallback((footerContent: FooterContent) => {
        setDraft((current) => ({
            ...current,
            footerContent,
        }));
    }, []);

    const applyBrowserPreview = useCallback(() => {
        if (!slug) {
            return;
        }
        setThemePreviewDraft(slug, {
            theme: draft.theme,
            themeColors: draft.themeColors,
            layoutSettings: draft.layoutSettings,
            footerContent: draft.footerContent,
        });
        dispatch(clearLiveThemePreview());
        dispatch(bumpThemeRevision());
        setStatusMessage("Preview applied in this browser only.");
    }, [draft, dispatch, slug]);

    const resetDraft = useCallback(() => {
        if (slug) {
            clearThemePreviewDraft(slug);
        }
        dispatch(clearLiveThemePreview());
        setDraft(baseDraft);
        setStatusMessage("Reverted to last loaded layout from API.");
    }, [baseDraft, dispatch, slug]);

    const resetToDefaultLayout = useCallback(() => {
        const defaults = buildDefaultStorefrontLayout(tenant?.name);
        setDraft({
            theme: defaults.theme,
            themeColors: defaults.themeColors,
            layoutSettings: defaults.layoutSettings,
            footerContent: defaults.footerContent,
        });
        setStatusMessage("Loaded platform default layout. Save to persist for your store.");
    }, [tenant?.name]);

    const saveForStore = useCallback(async () => {
        if (!tenant || !slug) {
            setStatusMessage("Store not loaded.");
            return;
        }
        if (!canSaveForStore) {
            setStatusMessage("Login as store admin (/admin/login) to save layout to database.");
            return;
        }
        setIsSaving(true);
        setStatusMessage("");
        try {
            await updateTenantTheme(tenant._id, {
                theme: draft.theme,
                themeColors: draft.themeColors,
                layoutSettings: draft.layoutSettings,
                footerContent: draft.footerContent,
            });
            const layout = await getStorefrontLayout(slug);
            dispatch(setTenant({
                ...tenant,
                theme: layout.theme,
                themeColors: draft.themeColors,
                layoutSettings: draft.layoutSettings,
                footerContent: draft.footerContent,
                storefrontLayout: {
                    theme: layout.theme,
                    themeColors: layout.themeColors,
                    layoutSettings: layout.layoutSettings,
                    footerContent: layout.footerContent,
                    isCustomized: layout.isCustomized,
                    source: layout.source,
                },
            }));
            await queryClient.invalidateQueries({ queryKey: ["storefront-layout", slug] });
            if (slug) {
                clearThemePreviewDraft(slug);
            }
            dispatch(clearLiveThemePreview());
            setStatusMessage("Layout saved to database. All visitors will see this layout.");
        }
        catch {
            setStatusMessage("Save failed. Login as store admin and try again.");
        }
        finally {
            setIsSaving(false);
        }
    }, [canSaveForStore, dispatch, draft, queryClient, slug, tenant]);

    return {
        draft,
        activeTab,
        setActiveTab,
        previewTab,
        setPreviewTab,
        statusMessage,
        isSaving,
        canSaveForStore,
        layoutSource,
        colorFields,
        presetNames: THEME_PRESET_NAMES,
        applyPreset,
        updateColor,
        updateLayout,
        updateFooterContent,
        applyBrowserPreview,
        resetDraft,
        resetToDefaultLayout,
        saveForStore,
        defaultColors: DEFAULT_THEME_COLORS,
        defaultLayout: DEFAULT_LAYOUT_SETTINGS,
    };
};
