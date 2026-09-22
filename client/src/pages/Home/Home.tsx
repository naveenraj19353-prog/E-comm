import { Fragment } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import PageLoader from "../../components/PageLoader";
import ProductCardSlider from "../../components/HomeProductSlider/ProductCardSlider";
import DealOfTheDay from "../../components/DealOfTheDay/DealOfTheDay";
import { useHome } from "../../features/home/hooks/useHome";
import styles from "./Home.module.css";
import StoreOpeningPlaceholder from "./StoreOpeningPlaceholder";
import BannerSlider from "../../components/Banner/BannerSlider";
import { isBannerVideoSrc } from "../../components/Banner/bannerMedia";
import CategorySlider from "../../components/CategorySlider/CategorySlider";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import Testimonials from "../../components/Testimonials/Testimonials";
import { testimonials as dummyTestimonials } from "../../components/Testimonials/dummyTestimonials";
import { useStorefrontProductActions } from "../../features/storefront/hooks/useStorefrontProductActions";
import { routes, storefrontNavigate, withQuery } from "../../routes/routes";
import {
    SeoHead,
    buildCanonicalUrl,
    buildOrganizationJsonLd,
    buildWebSiteJsonLd,
    storeShareImage,
} from "../../features/seo";
import { normalizeHomeSectionOrder, type HomeSectionId } from "../../theme/homeSections";

const Home = () => {
    const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
    const layoutSettings = useLayoutSettings();
    const navigate = useNavigate();
    const { data: homeData, isLoading, isError, refetch } = useHome(tenantId);
    const { handleWishlist, handleAddToCart, isProductWishlisted } = useStorefrontProductActions();
    const go = (to: string) => storefrontNavigate(navigate, to);

    const storeName = tenant?.name || tenantSlug || "Store";
    const storeUrl = buildCanonicalUrl("/", tenantSlug);
    const storeDescription =
        tenant?.footerContent?.description?.trim() ||
        `Shop ${storeName} on Retail Cosmos — products, deals, and more.`;
    const storeImage = storeShareImage(tenant);

    if (isLoading) {
        return (
            <>
                <SeoHead
                    title={storeName}
                    description={storeDescription}
                    path="/"
                    tenantSlug={tenantSlug}
                    image={storeImage}
                    noIndex
                />
                <PageLoader message="Loading store..." />
            </>
        );
    }

    if (isError) {
        return (
            <div className={styles.error}>
                <SeoHead
                    title={`${storeName} unavailable`}
                    description={`Unable to load ${storeName} right now.`}
                    path="/"
                    tenantSlug={tenantSlug}
                    noIndex
                />
                <h2>Unable to load store</h2>
                <button onClick={() => refetch()}>Retry</button>
            </div>
        );
    }

    if (!homeData) {
        return null;
    }

    const {
        banners = [],
        trendingProducts = [],
        bestDiscountProducts = [],
        mostSellingProducts = [],
        newArrivals = [],
        topRatedProducts = [],
        dealOfTheDay = [],
        festivalOffers = [],
    } = homeData;
    const festivalOffer = festivalOffers[0] || null;
    const hasCatalog = [
        trendingProducts,
        bestDiscountProducts,
        mostSellingProducts,
        newArrivals,
        topRatedProducts,
        dealOfTheDay,
    ].some((list) => list.length > 0);

    if (!hasCatalog) {
        return (
            <main className={styles.home}>
                <SeoHead
                    title={storeName}
                    description={storeDescription}
                    path="/"
                    tenantSlug={tenantSlug}
                    image={storeImage || undefined}
                    jsonLdId="store-home"
                    jsonLd={[
                        buildOrganizationJsonLd({
                            name: storeName,
                            url: storeUrl,
                            description: storeDescription,
                        }),
                    ]}
                />
                <StoreOpeningPlaceholder storeName={storeName} tenant={tenant} />
            </main>
        );
    }

    const shareBanner = banners.find(
        (banner) => banner.image && !isBannerVideoSrc(banner.image, banner.mediaType),
    );

    const productSlider = (title: string, products: typeof trendingProducts) =>
        products.length > 0 ? (
            <section className={styles.productSection}>
                <ProductCardSlider title={title} products={products} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
            </section>
        ) : null;
    const shownProductSets = new Set<string>();
    const uniqueProductSlider = (title: string, products: typeof trendingProducts) => {
        if (!products.length) {
            return null;
        }
        const signature = products.map((product) => product._id).join(",");
        if (shownProductSets.has(signature)) {
            return null;
        }
        shownProductSets.add(signature);
        return productSlider(title, products);
    };

    const homeSections: Partial<Record<HomeSectionId, () => ReactNode>> = {
        banner: () => layoutSettings.showHomeBanner ? (
            <section className={`${styles.bannerSection} ${layoutSettings.homeBannerStyle === "contained" ? styles.bannerContained : ""}`}>
                <BannerSlider banners={banners} />
            </section>
        ) : null,
        festival: () => festivalOffers.length > 0 ? (
            <section className={styles.festivalSection} aria-label="Festival offers">
                {festivalOffers.map((offer) => (
                    <div key={offer.code} className={styles.festivalCard}>
                        <span className={styles.festivalEyebrow}>Festival offer</span>
                        <h2>{offer.title}</h2>
                        <p>{offer.message}</p>
                        <strong>Use code {offer.code}</strong>
                    </div>
                ))}
            </section>
        ) : null,
        categories: () => layoutSettings.showCategorySlider ? (
            <CategorySlider
                tenantId={tenantId}
                onCategoryClick={(category) => {
                    go(withQuery(routes.products(tenantSlug), {
                        categoryIds: category._id || category.name,
                    }));
                }}
            />
        ) : null,
        trending: () => uniqueProductSlider("Trending Products", trendingProducts),
        discounts: () => uniqueProductSlider("Best Discounts", bestDiscountProducts),
        mostSelling: () => uniqueProductSlider("Most Selling", mostSellingProducts),
        newArrivals: () => uniqueProductSlider("New Arrivals", newArrivals),
        topRated: () => uniqueProductSlider("Top Rated Products", topRatedProducts),
        dealOfTheDay: () => layoutSettings.showDealOfTheDay && dealOfTheDay.length > 0 ? (
            <section className={styles.productSection}>
                <DealOfTheDay
                    products={dealOfTheDay}
                    festivalOffer={festivalOffer}
                    isWishlisted={isProductWishlisted}
                    onToggleWishlist={handleWishlist}
                    onQuickAdd={handleAddToCart}
                />
            </section>
        ) : null,
        testimonials: () => layoutSettings.showTestimonials ? (
            <section className={styles.productSection}>
                <Testimonials testimonials={dummyTestimonials} />
            </section>
        ) : null,
    };

    return (
        <main className={styles.home}>
            <SeoHead
                title={storeName}
                description={storeDescription}
                path="/"
                tenantSlug={tenantSlug}
                image={storeShareImage(tenant, shareBanner?.image) || undefined}
                jsonLdId="store-home"
                jsonLd={[
                    buildOrganizationJsonLd({
                        name: storeName,
                        url: storeUrl,
                        description: storeDescription,
                    }),
                    buildWebSiteJsonLd({
                        name: storeName,
                        url: storeUrl,
                        searchUrlTemplate: `${buildCanonicalUrl("/products", tenantSlug)}?search={search_term_string}`,
                    }),
                ]}
            />
            {normalizeHomeSectionOrder(layoutSettings.homeSectionOrder).map((section) => {
                const block = homeSections[section]?.() ?? null;
                return block ? <Fragment key={section}>{block}</Fragment> : null;
            })}
        </main>
    );
};

export default Home;
