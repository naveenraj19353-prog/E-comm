import { ArrowLeft, Database, Palette, RotateCcw, Save, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useThemeCustomizer } from "../../features/theme/hooks/useThemeCustomizer";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { presetLabels, themePresets, type ThemePresetName } from "../../theme/themePresets";
import ThemePreview from "./ThemePreview";
import FooterContentEditor from "./FooterContentEditor";
import styles from "./ThemeCustomizer.module.css";

const previewTabs = [
    { id: "home", label: "Home" },
    { id: "products", label: "Listing" },
    { id: "detail", label: "Detail" },
    { id: "cart", label: "Cart" },
    { id: "wishlist", label: "Wishlist" },
] as const;

const editorTabs = [
    { id: "home", label: "Home" },
    { id: "catalog", label: "Catalog" },
    { id: "components", label: "Components" },
    { id: "chrome", label: "Header & Footer" },
    { id: "footer", label: "Footer content" },
    { id: "colors", label: "Colors" },
] as const;

const ThemeCustomizer = () => {
    const navigate = useNavigate();
    const { tenantSlug } = useStorefrontTenant();
    const {
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
        presetNames,
        applyPreset,
        updateColor,
        updateLayout,
        updateFooterContent,
        applyBrowserPreview,
        resetDraft,
        resetToDefaultLayout,
        saveForStore,
    } = useThemeCustomizer();

    return (
        <div className={styles.page}>
            <header className={styles.topBar}>
                <button type="button" className={styles.backButton} onClick={() => navigate(tenantSlug ? `/${tenantSlug}` : "/")}>
                    <ArrowLeft size={18} />
                    Back to store
                </button>
                <div className={styles.sourceBadge} data-source={layoutSource}>
                    <Database size={14} />
                    {layoutSource === "database" ? "Loaded from database" : "Using default layout"}
                </div>
            </header>

            <section className={styles.intro}>
                <h1>Store layout studio</h1>
                <p>
                    Layout loads from the storefront API when your store opens.
                    If nothing is saved yet, the default layout is used.
                    Customize here and save to the database for all visitors.
                </p>
            </section>

            <div className={styles.workspace}>
                <aside className={styles.sidebar}>
                    <nav className={styles.tabNav}>
                        {editorTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={activeTab === tab.id ? styles.tabActive : styles.tab}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    <div className={styles.panelBody}>
                        {activeTab === "home" && (
                            <div className={styles.fieldGrid}>
                                <Toggle label="Show home banner" checked={draft.layoutSettings.showHomeBanner} onChange={(v) => updateLayout("showHomeBanner", v)} />
                                <Toggle label="Show category slider" checked={draft.layoutSettings.showCategorySlider} onChange={(v) => updateLayout("showCategorySlider", v)} />
                                <Toggle label="Show deal of the day" checked={draft.layoutSettings.showDealOfTheDay} onChange={(v) => updateLayout("showDealOfTheDay", v)} />
                                <Toggle label="Show testimonials" checked={draft.layoutSettings.showTestimonials} onChange={(v) => updateLayout("showTestimonials", v)} />
                                <Select label="Banner style" value={draft.layoutSettings.homeBannerStyle} onChange={(v) => updateLayout("homeBannerStyle", v as typeof draft.layoutSettings.homeBannerStyle)} options={[["full", "Full width"], ["contained", "Contained"]]} />
                                <Select label="Page width" value={draft.layoutSettings.pageWidth} onChange={(v) => updateLayout("pageWidth", v as typeof draft.layoutSettings.pageWidth)} options={[["narrow", "Narrow"], ["standard", "Standard (90%)"], ["wide", "Wide (100%)"]]} />
                            </div>
                        )}

                        {activeTab === "catalog" && (
                            <div className={styles.fieldGrid}>
                                <Select label="Product listing layout" value={draft.layoutSettings.productListingLayout} onChange={(v) => updateLayout("productListingLayout", v as typeof draft.layoutSettings.productListingLayout)} options={[["sidebar-left", "Filters left"], ["sidebar-right", "Filters right"], ["filters-top", "Top filters"]]} />
                                <Select label="Product view" value={draft.layoutSettings.productViewMode} onChange={(v) => updateLayout("productViewMode", v as typeof draft.layoutSettings.productViewMode)} options={[["grid", "Grid"], ["list", "List"]]} />
                                <Select label="Grid columns" value={String(draft.layoutSettings.productGridColumns)} onChange={(v) => updateLayout("productGridColumns", Number(v))} options={[["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} />
                                <Select label="Product detail layout" value={draft.layoutSettings.productDetailLayout} onChange={(v) => updateLayout("productDetailLayout", v as typeof draft.layoutSettings.productDetailLayout)} options={[["gallery-left", "Gallery left"], ["gallery-right", "Gallery right"], ["stacked", "Stacked"]]} />
                                <Select label="Cart layout" value={draft.layoutSettings.cartLayout} onChange={(v) => updateLayout("cartLayout", v as typeof draft.layoutSettings.cartLayout)} options={[["split", "Split"], ["stacked", "Stacked"]]} />
                                <Select label="Card style" value={draft.layoutSettings.cardStyle} onChange={(v) => updateLayout("cardStyle", v as typeof draft.layoutSettings.cardStyle)} options={[["sharp", "Sharp"], ["rounded", "Rounded"], ["soft", "Soft"]]} />
                                <Select label="Section spacing" value={draft.layoutSettings.sectionSpacing} onChange={(v) => updateLayout("sectionSpacing", v as typeof draft.layoutSettings.sectionSpacing)} options={[["compact", "Compact"], ["comfortable", "Comfortable"], ["spacious", "Spacious"]]} />
                            </div>
                        )}

                        {activeTab === "components" && (
                            <div className={styles.fieldGrid}>
                                <Select label="Wishlist heart icon" value={draft.layoutSettings.wishlistIconPosition} onChange={(v) => updateLayout("wishlistIconPosition", v as typeof draft.layoutSettings.wishlistIconPosition)} options={[["left", "Left on product card"], ["right", "Right on product card"]]} />
                                <Select label="Product card image ratio" value={draft.layoutSettings.productCardImageRatio} onChange={(v) => updateLayout("productCardImageRatio", v as typeof draft.layoutSettings.productCardImageRatio)} options={[["square", "Square (1:1)"], ["portrait", "Portrait (4:5)"], ["landscape", "Landscape (4:3)"]]} />
                                <Toggle label="Show product rating on card" checked={draft.layoutSettings.showProductRating} onChange={(v) => updateLayout("showProductRating", v)} />
                                <Toggle label="Show quick add to cart button" checked={draft.layoutSettings.showQuickAddOnCard} onChange={(v) => updateLayout("showQuickAddOnCard", v)} />
                                <Toggle label="Show discount badge" checked={draft.layoutSettings.showDiscountBadge} onChange={(v) => updateLayout("showDiscountBadge", v)} />
                            </div>
                        )}

                        {activeTab === "chrome" && (
                            <div className={styles.fieldGrid}>
                                <Toggle label="Sticky header on scroll" checked={draft.layoutSettings.stickyHeader} onChange={(v) => updateLayout("stickyHeader", v)} />
                                <Toggle label="Show search bar in header" checked={draft.layoutSettings.showHeaderSearch} onChange={(v) => updateLayout("showHeaderSearch", v)} />
                                <Select label="Logo position" value={draft.layoutSettings.headerLogoPosition} onChange={(v) => updateLayout("headerLogoPosition", v as typeof draft.layoutSettings.headerLogoPosition)} options={[["left", "Left"], ["center", "Center"]]} />
                                <Select label="Search position" value={draft.layoutSettings.headerSearchPosition} onChange={(v) => updateLayout("headerSearchPosition", v as typeof draft.layoutSettings.headerSearchPosition)} options={[["right", "Right (with icons)"], ["center", "Center"], ["after-logo", "After logo"]]} disabled={!draft.layoutSettings.showHeaderSearch} />
                                <Toggle label="Show category links in header" checked={draft.layoutSettings.showHeaderCategories} onChange={(v) => updateLayout("showHeaderCategories", v)} />
                                <Select label="Category links alignment" value={draft.layoutSettings.headerNavAlignment} onChange={(v) => updateLayout("headerNavAlignment", v as typeof draft.layoutSettings.headerNavAlignment)} options={[["left", "Left"], ["center", "Center"]]} disabled={!draft.layoutSettings.showHeaderCategories} />
                                <Select label="Footer layout" value={draft.layoutSettings.footerLayout} onChange={(v) => updateLayout("footerLayout", v as typeof draft.layoutSettings.footerLayout)} options={[["full", "Full (brand + link columns)"], ["compact", "Compact (2 columns)"], ["minimal", "Minimal (copyright only)"]]} />
                                <Toggle label="Show footer link columns" checked={draft.layoutSettings.showFooterLinks} onChange={(v) => updateLayout("showFooterLinks", v)} disabled={draft.layoutSettings.footerLayout === "minimal"} />
                                <Toggle label="Show footer social icons" checked={draft.layoutSettings.showFooterSocial} onChange={(v) => updateLayout("showFooterSocial", v)} disabled={draft.layoutSettings.footerLayout === "minimal"} />
                            </div>
                        )}

                        {activeTab === "footer" && (
                            <FooterContentEditor
                                value={draft.footerContent}
                                onChange={updateFooterContent}
                            />
                        )}

                        {activeTab === "colors" && (
                            <>
                                <div className={styles.presetRow}>
                                    {presetNames.map((preset: ThemePresetName) => (
                                        <button key={preset} type="button" className={`${styles.presetChip} ${draft.theme === preset ? styles.presetChipActive : ""}`} onClick={() => applyPreset(preset)}>
                                            <span style={{ background: themePresets[preset].primary }} />
                                            {presetLabels[preset]}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.colorGrid}>
                                    {colorFields.map(({ key, label }) => (
                                        <label key={key} className={styles.colorField}>
                                            <span>{label}</span>
                                            <div className={styles.colorInputRow}>
                                                <input type="color" value={draft.themeColors[key]} onChange={(e) => updateColor(key, e.target.value)} />
                                                <input type="text" value={draft.themeColors[key]} onChange={(e) => updateColor(key, e.target.value)} />
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div className={styles.actions}>
                        <button type="button" className={styles.secondaryBtn} onClick={resetToDefaultLayout}>
                            <Palette size={16} />
                            Default layout
                        </button>
                        <button type="button" className={styles.secondaryBtn} onClick={resetDraft}>
                            <RotateCcw size={16} />
                            Undo changes
                        </button>
                        <button type="button" className={styles.secondaryBtn} onClick={applyBrowserPreview}>
                            <Sparkles size={16} />
                            Preview in browser
                        </button>
                        <button type="button" className={styles.primaryBtn} disabled={isSaving} onClick={() => void saveForStore()}>
                            <Save size={16} />
                            {canSaveForStore ? "Save to database" : "Saving unavailable"}
                        </button>
                    </div>
                    {statusMessage && <p className={styles.status}>{statusMessage}</p>}
                </aside>

                <section className={styles.previewPane}>
                    <div className={styles.previewHeader}>
                        <h2>Live preview</h2>
                        <div className={styles.previewTabs}>
                            {previewTabs.map((tab) => (
                                <button key={tab.id} type="button" className={previewTab === tab.id ? styles.previewTabActive : styles.previewTab} onClick={() => setPreviewTab(tab.id)}>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ThemePreview tab={previewTab} draft={draft} />
                </section>
            </div>
        </div>
    );
};

const Toggle = ({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
    <label className={styles.toggleField}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
    </label>
);

const Select = ({ label, value, onChange, options, disabled = false }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<[string, string]>;
    disabled?: boolean;
}) => (
    <label className={styles.field}>
        <span>{label}</span>
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {options.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>{optionLabel}</option>
            ))}
        </select>
    </label>
);

export default ThemeCustomizer;
