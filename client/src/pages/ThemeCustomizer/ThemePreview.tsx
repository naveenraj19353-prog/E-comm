import type { ThemeDraft } from "../../theme/types";
import styles from "./ThemePreview.module.css";

type PreviewTab = "home" | "products" | "detail" | "cart" | "wishlist";

interface ThemePreviewProps {
    tab: PreviewTab;
    draft: ThemeDraft;
}

const getCardRadius = (cardStyle: ThemeDraft["layoutSettings"]["cardStyle"]) => {
    if (cardStyle === "sharp") {
        return "0.25rem";
    }
    if (cardStyle === "soft") {
        return "1rem";
    }
    return "0.625rem";
};

const ThemePreview = ({ tab, draft }: ThemePreviewProps) => {
    const { themeColors, layoutSettings, footerContent } = draft;
    const previewStyle = {
        "--primary": themeColors.primary,
        "--secondary": themeColors.secondary,
        "--background": themeColors.background,
        "--surface": themeColors.surface,
        "--border": themeColors.border,
        "--text": themeColors.textBlack,
        "--text-black": themeColors.textBlack,
        "--text-white": themeColors.textWhite,
        "--layout-card-radius": getCardRadius(layoutSettings.cardStyle),
        "--layout-grid-gap": layoutSettings.sectionSpacing === "compact"
            ? "0.75rem"
            : layoutSettings.sectionSpacing === "spacious"
                ? "1.25rem"
                : "1rem",
        maxWidth: layoutSettings.pageWidth === "narrow"
            ? "28rem"
            : layoutSettings.pageWidth === "wide"
                ? "100%"
                : "36rem",
    } as React.CSSProperties;

    const gridColumns = layoutSettings.productViewMode === "list"
        ? "1fr"
        : `repeat(${Math.min(layoutSettings.productGridColumns, 3)}, 1fr)`;

    const listingClass = layoutSettings.productListingLayout === "sidebar-right"
        ? styles.listingSidebarRight
        : layoutSettings.productListingLayout === "filters-top"
            ? styles.listingFiltersTop
            : styles.listingSidebarLeft;

    const detailClass = layoutSettings.productDetailLayout === "gallery-right"
        ? styles.detailGalleryRight
        : layoutSettings.productDetailLayout === "stacked"
            ? styles.detailStacked
            : styles.detailGalleryLeft;

    const cartClass = layoutSettings.cartLayout === "stacked"
        ? styles.cartStacked
        : styles.cartSplit;

    const headerPreviewClass = [
        styles.previewHeaderBar,
        layoutSettings.stickyHeader ? styles.previewChromeSticky : "",
        layoutSettings.headerLogoPosition === "center" ? styles.previewLogoCenter : styles.previewLogoLeft,
        layoutSettings.headerSearchPosition === "center"
            ? styles.previewSearchCenter
            : layoutSettings.headerSearchPosition === "after-logo"
                ? styles.previewSearchAfterLogo
                : styles.previewSearchRight,
        layoutSettings.showHeaderCategories
            ? layoutSettings.headerNavAlignment === "center"
                ? styles.previewNavCenter
                : styles.previewNavLeft
            : styles.previewNavHidden,
    ].join(" ");

    return (
        <div className={styles.previewFrame} style={previewStyle}>
            <div className={headerPreviewClass}>
                <span className={styles.previewLogo}>Logo</span>
                {layoutSettings.showHeaderCategories && <span className={styles.previewNav}>Categories</span>}
                {layoutSettings.showHeaderSearch && <span className={styles.previewSearch}>Search</span>}
                <span className={styles.previewActions}>Cart</span>
                {layoutSettings.stickyHeader && <em className={styles.previewStickyTag}>sticky</em>}
            </div>
      {tab === "home" && (
                <>
                    {layoutSettings.showHomeBanner && (
                        <div className={`${styles.banner} ${layoutSettings.homeBannerStyle === "contained" ? styles.bannerContained : ""}`}>
                            <span>Summer Collection</span>
                            <button type="button">Shop now</button>
                        </div>
                    )}
                    {layoutSettings.showCategorySlider && (
                        <div className={styles.chips}>
                            <span>Men</span>
                            <span>Women</span>
                            <span>Kids</span>
                        </div>
                    )}
                    {layoutSettings.showDealOfTheDay && (
                        <div className={styles.dealCard}>
                            <strong>Deal of the Day</strong>
                            <span>Ends in 04:22:10</span>
                        </div>
                    )}
                    <div className={styles.miniGrid} style={{ gridTemplateColumns: gridColumns }}>
                        {[1, 2, 3].map((item) => (
                            <div key={item} className={`${styles.productCard} ${layoutSettings.productViewMode === "list" ? styles.productCardList : ""}`}>
                                <div className={styles.productImage} style={{ position: "relative" }}>
                                    {layoutSettings.wishlistIconPosition === "left" ? <span className={styles.heartLeft}>♥</span> : <span className={styles.heartRight}>♥</span>}
                                </div>
                                <strong>Product {item}</strong>
                                <span>₹1,299</span>
                            </div>
                        ))}
                    </div>
                    {layoutSettings.showTestimonials && (
                        <div className={styles.testimonialCard}>
                            <strong>What customers say</strong>
                            <span>★★★★★ Great quality and fast delivery!</span>
                        </div>
                    )}
                    {layoutSettings.footerLayout !== "minimal" && (
                        <div className={`${styles.footerPreview} ${layoutSettings.footerLayout === "compact" ? styles.footerPreviewCompact : ""}`}>
                            <strong>{footerContent.companyName}</strong>
                            <span>{footerContent.description.slice(0, 48)}{footerContent.description.length > 48 ? "…" : ""}</span>
                            {layoutSettings.showFooterLinks && footerContent.sections.slice(0, 2).map((section) => (
                                <span key={section.title}>{section.title}</span>
                            ))}
                            {layoutSettings.showFooterSocial && <span>Social</span>}
                        </div>
                    )}
                    {layoutSettings.footerLayout === "minimal" && (
                        <div className={styles.footerPreviewMinimal}>© {footerContent.companyName}</div>
                    )}
                </>
            )}

            {tab === "products" && (
                <div className={`${styles.listingLayout} ${listingClass}`}>
                    {layoutSettings.productListingLayout !== "filters-top" && (
                        <aside className={styles.listingSidebar}>Filters</aside>
                    )}
                    <div className={styles.listingMain}>
                        {layoutSettings.productListingLayout === "filters-top" && (
                            <div className={styles.toolbar}>Filters · Sort: Newest</div>
                        )}
                        <div className={styles.miniGrid} style={{ gridTemplateColumns: gridColumns }}>
                            {[1, 2, 3, 4, 5, 6].map((item) => (
                                <div key={item} className={`${styles.productCard} ${layoutSettings.productViewMode === "list" ? styles.productCardList : ""}`}>
                                    <div className={styles.productImage} />
                                    <div>
                                        <strong>Listing {item}</strong>
                                        <span>₹899</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tab === "detail" && (
                <div className={`${styles.detailLayout} ${detailClass}`}>
                    <div className={styles.detailImage} />
                    <div className={styles.detailInfo}>
                        <h3>Premium Cotton Shirt</h3>
                        <span className={styles.rating}>★ 4.5 (120 reviews)</span>
                        <strong className={styles.price}>₹1,499</strong>
                        <div className={styles.sizes}>
                            {["S", "M", "L"].map((size) => (
                                <span key={size}>{size}</span>
                            ))}
                        </div>
                        <button type="button" className={styles.primaryButton}>Add to cart</button>
                    </div>
                </div>
            )}

            {tab === "cart" && (
                <div className={`${styles.cartLayout} ${cartClass}`}>
                    <div className={styles.cartItems}>
                        {[1, 2].map((item) => (
                            <div key={item} className={styles.cartRow}>
                                <div className={styles.cartThumb} />
                                <div>
                                    <strong>Cart item {item}</strong>
                                    <span>Size M · Black</span>
                                </div>
                                <strong>₹999</strong>
                            </div>
                        ))}
                    </div>
                    <div className={styles.summaryCard}>
                        <div><span>Subtotal</span><strong>₹1,998</strong></div>
                        <button type="button" className={styles.primaryButton}>Checkout</button>
                    </div>
                </div>
            )}

            {tab === "wishlist" && (
                <div className={styles.miniGrid} style={{ gridTemplateColumns: gridColumns }}>
                    {[1, 2, 3].map((item) => (
                        <div key={item} className={`${styles.productCard} ${layoutSettings.productViewMode === "list" ? styles.productCardList : ""}`}>
                            <div className={styles.productImage} />
                            <div>
                                <strong>Wishlist {item}</strong>
                                <button type="button" className={styles.secondaryButton}>Move to cart</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ThemePreview;
