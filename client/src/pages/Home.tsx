import { useAppSelector } from "../app/hooks";
import ProductCardSlider from "../components/card/Productcardslider";
import DealOfTheDay from "../components/DealOfTheDay/DealOfTheDay";
import { useHome } from "../features/home/hooks/useHome";
import styles from "./Home.module.css";
import { useCart } from "../features/cart/hooks/useCart";
import { useWishlist } from "../features/wishlist/hooks/useWishlist";
import BannerSlider from "../components/banner/BannerSlider";
import CategorySlider from "../components/CategorySlider/CategorySlider";
const Home = () => {
  const tenantSlug = useAppSelector((state) => state.tenant.tenantSlug);
  const user = useAppSelector((state) => state.auth.user);
  const tenantId = tenantSlug;
  const { data: homeData, isLoading, isError, refetch } = useHome(tenantId);
  const { addToCart } = useCart(user?._id, tenantId);
  const { addToWishlist, removeFromWishlist } = useWishlist(user?._id, tenantId);
  const handleWishlist = async (productId: string, isAdding: boolean) => {
    if (!user?._id) {
      console.log("User is not logged in");
      return;
    }
    try {
      if (isAdding) {
        await addToWishlist({
          tenantId,
          userId: user?._id,
          productId,
        });
        console.log("Product added to wishlist");
      } else {
        await removeFromWishlist(productId, user?._id, tenantId);
        console.log("Product removed from wishlist");
      }
    } catch (error) {
      console.error("Wishlist operation failed:", error);
    }
  };
  const handleAddToCart = async (productId: string) => {
    if (!user?._id) {
      console.log("User is not logged in");
      return;
    }
    try {
      await addToCart({
        tenantId,
        userId: user?._id,
        productId,
        quantity: 1,
      });
      console.log("Product added to cart");
    } catch (error) {
      console.error("Add to cart failed:", error);
    }
  };
  if (isLoading) {
    return <div className={styles.loading}>Loading store...</div>;
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
    categories = [],
    trendingProducts = [],
    bestDiscountProducts = [],
    mostSellingProducts = [],
    newArrivals = [],
    topRatedProducts = [],
    dealOfTheDay = [],
    brands = [],
  } = homeData;
  return (
    <main className={styles.home}>
      <section className={styles.bannerSection}>
        <BannerSlider banners={banners} />
      </section>

      <section>
        <CategorySlider
          tenantId={tenantId}
          onCategoryClick={(category) => {
            console.log(
              "Selected category:",
              category
            );
          }}
        />
      </section>
      <section className={styles.productSection}>
        <ProductCardSlider
          title="Trending Products"
          products={trendingProducts}
          onToggleWishlist={handleWishlist}
          onQuickAdd={handleAddToCart}
        />
      </section>

      <section className={styles.productSection}>
        <ProductCardSlider
          title="Best Discounts"
          products={bestDiscountProducts}
          onToggleWishlist={handleWishlist}
          onQuickAdd={handleAddToCart}
        />
      </section>

      {mostSellingProducts.length > 0 && (
        <section className={styles.productSection}>
          <ProductCardSlider
            title="Most Selling"
            products={mostSellingProducts}
            onToggleWishlist={handleWishlist}
            onQuickAdd={handleAddToCart}
          />
        </section>
      )}

      <section className={styles.productSection}>
        <ProductCardSlider
          title="New Arrivals"
          products={newArrivals}
          onToggleWishlist={handleWishlist}
          onQuickAdd={handleAddToCart}
        />
      </section>

      <section className={styles.productSection}>
        <ProductCardSlider
          title="Top Rated Products"
          products={topRatedProducts}
          onToggleWishlist={handleWishlist}
          onQuickAdd={handleAddToCart}
        />
      </section>

      {dealOfTheDay.length > 0 && (
        <section className={styles.productSection}>
          <DealOfTheDay products={dealOfTheDay} />
        </section>
      )}
    </main>
  );
};
export default Home;
