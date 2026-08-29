import { useNavigate } from "react-router-dom";
import PageLoader from "../components/PageLoader";
import ProductCardSlider from "../components/card/Productcardslider";
import DealOfTheDay from "../components/DealOfTheDay/DealOfTheDay";
import { useHome } from "../features/home/hooks/useHome";
import styles from "./Home.module.css";
import BannerSlider from "../components/banner/BannerSlider";
import CategorySlider from "../components/CategorySlider/CategorySlider";
import { useStorefrontTenant } from "../features/tenant/useTenant";
import { useLayoutSettings } from "../theme/useThemeSettings";
import Testimonials from "../components/Testimonials/Testimonials";
import { testimonials as dummyTestimonials } from "../components/Testimonials/dummyTestimonials";
import { useStorefrontProductActions } from "../features/storefront/hooks/useStorefrontProductActions";

const Home = () => {
    const { tenantId, tenantSlug } = useStorefrontTenant();
    const layoutSettings = useLayoutSettings();
    const navigate = useNavigate();
    const { data: homeData, isLoading, isError, refetch } = useHome(tenantId);
    const { handleWishlist, handleAddToCart, isProductWishlisted } = useStorefrontProductActions();

    if (isLoading) {
        return <PageLoader message="Loading store..." />;
    }

    if (isError) {
        return (
            <div className={styles.error}>
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
    } = homeData;

    return (
        <main className={styles.home}>
            {layoutSettings.showHomeBanner && (
                <section className={`${styles.bannerSection} ${layoutSettings.homeBannerStyle === "contained" ? styles.bannerContained : ""}`}>
                    <BannerSlider banners={banners} />
                </section>
            )}

            {layoutSettings.showCategorySlider && (
                <section>
                    <CategorySlider
                        tenantId={tenantId}
                        onCategoryClick={(category) => {
                            navigate(`/${tenantSlug}/products?categoryIds=${encodeURIComponent(category._id || category.name)}`);
                        }}
                    />
                </section>
            )}

            <section className={styles.productSection}>
                <ProductCardSlider title="Trending Products" products={trendingProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
            </section>

            <section className={styles.productSection}>
                <ProductCardSlider title="Best Discounts" products={bestDiscountProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
            </section>

            {mostSellingProducts.length > 0 && (
                <section className={styles.productSection}>
                    <ProductCardSlider title="Most Selling" products={mostSellingProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
                </section>
            )}

            <section className={styles.productSection}>
                <ProductCardSlider title="New Arrivals" products={newArrivals} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
            </section>

            <section className={styles.productSection}>
                <ProductCardSlider title="Top Rated Products" products={topRatedProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart} />
            </section>

            {layoutSettings.showDealOfTheDay && dealOfTheDay.length > 0 && (
                <section className={styles.productSection}>
                    <DealOfTheDay
                        products={dealOfTheDay}
                        isWishlisted={isProductWishlisted}
                        onToggleWishlist={handleWishlist}
                        onQuickAdd={handleAddToCart}
                    />
                </section>
            )}

            {layoutSettings.showTestimonials && (
                <section className={styles.productSection}>
                    <Testimonials testimonials={dummyTestimonials} />
                </section>
            )}
        </main>
    );
};

export default Home;
