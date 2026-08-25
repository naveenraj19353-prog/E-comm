import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import ProductCardSlider from "../components/card/Productcardslider";
import DealOfTheDay from "../components/DealOfTheDay/DealOfTheDay";
import { useHome } from "../features/home/hooks/useHome";
import styles from "./Home.module.css";
import { useCart } from "../features/cart/hooks/useCart";
import { useWishlist } from "../features/wishlist/hooks/useWishlist";
import BannerSlider from "../components/banner/BannerSlider";
import CategorySlider from "../components/CategorySlider/CategorySlider";
import { useStorefrontTenant } from "../features/tenant/useTenant";
const Home = () => {
    const { tenantId, tenantSlug } = useStorefrontTenant();
    const navigate = useNavigate();
    const user = useAppSelector((state) => state.auth.user);
    const { data: homeData, isLoading, isError, refetch } = useHome(tenantId);
    const { addToCart } = useCart(user?._id as string, tenantId);
    const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(user?._id as string, tenantId);
    const handleWishlist = async (productId: string, isAdding: boolean) => {
        if (!user?._id) {
            navigate(tenantSlug ? `/${tenantSlug}/login` : "/login");
            return;
        }
        try {
            if (isAdding) {
                await addToWishlist({
                    tenantId,
                    userId: user._id,
                    productId,
                });
                console.log("Product added to wishlist");
            }
            else {
                await removeFromWishlist(productId);
                console.log("Product removed from wishlist");
            }
        }
        catch (error) {
            console.error("Wishlist operation failed:", error);
        }
    };
    const handleAddToCart = async (productId: string, variantId: string, color: string, size: string) => {
        if (!user?._id) {
            navigate(tenantSlug ? `/${tenantSlug}/login` : "/login");
            return;
        }
        try {
            const payload = {
                tenantId,
                userId: user._id,
                productId,
                variantId,
                quantity: 1,
                color,
                size,
            };
            console.log("ADD TO CART PAYLOAD:", payload);
            await addToCart(payload);
            console.log("Product added to cart");
        }
        catch (error) {
            console.error("Add to cart failed:", error);
        }
    };
    if (isLoading) {
        return <div className={styles.loading}>Loading store...</div>;
    }
    if (isError) {
        return (<div className={styles.error}>
        <h2>Unable to load store</h2>
        <button onClick={() => refetch()}>Retry</button>
      </div>);
    }
    if (!homeData) {
        return null;
    }
    const { banners = [], trendingProducts = [], bestDiscountProducts = [], mostSellingProducts = [], newArrivals = [], topRatedProducts = [], dealOfTheDay = [], } = homeData;
    const isProductWishlisted = (productId: string) => {
        return wishlist?.some((item) => item.productId === productId);
    };
    return (<main className={styles.home}>
      
      <section className={styles.bannerSection}>
        <BannerSlider banners={banners}/>
      </section>
      
      <section>
        <CategorySlider tenantId={tenantId} onCategoryClick={(category) => {
            console.log("Selected category:", category);
        }}/>
      </section>
      
      <section className={styles.productSection}>
        <ProductCardSlider title="Trending Products" products={trendingProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
      </section>
      
      <section className={styles.productSection}>
        <ProductCardSlider title="Best Discounts" products={bestDiscountProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
      </section>
      
      {mostSellingProducts.length > 0 && (<section className={styles.productSection}>
          <ProductCardSlider title="Most Selling" products={mostSellingProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
        </section>)}
      
      <section className={styles.productSection}>
        <ProductCardSlider title="New Arrivals" products={newArrivals} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
      </section>
      
      <section className={styles.productSection}>
        <ProductCardSlider title="Top Rated Products" products={topRatedProducts} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
      </section>
      
      {dealOfTheDay.length > 0 && (<section className={styles.productSection}>
          <DealOfTheDay products={dealOfTheDay} isWishlisted={isProductWishlisted} onToggleWishlist={handleWishlist} onQuickAdd={handleAddToCart}/>
        </section>)}
    </main>);
};
export default Home;
