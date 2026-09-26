import ProductCardSlider from "../../components/HomeProductSlider/ProductCardSlider";
import { Spinner } from "../../components/Loading";
import { useStorefrontProductActions } from "../../features/storefront/hooks/useStorefrontProductActions";
import { useSimilarProducts } from "../../features/products/hooks/useSimilarProducts";
import type { Product } from "../../features/products/types";
import styles from "./ProductDetails.module.css";

interface SimilarProductsProps {
    product: Product;
    isServiceMode?: boolean;
    isMenuMode?: boolean;
}

const SimilarProducts = ({
    product,
    isServiceMode = false,
    isMenuMode = false,
}: SimilarProductsProps) => {
    const { data: products = [], isLoading } = useSimilarProducts(
        product.tenantId,
        product._id,
        product.categoryId,
    );
    const {
        handleWishlist,
        handleAddToCart,
        isProductWishlisted,
        addingProductId,
        wishlistPendingId,
    } = useStorefrontProductActions();

    const title = isServiceMode
        ? "Similar Services"
        : isMenuMode
          ? "Similar Items"
          : "Similar Products";

    if (!isLoading && products.length === 0) {
        return null;
    }

    return (
        <section className={styles.similarSection} aria-label={title}>
            {isLoading ? (
                <p className={styles.similarLoading}>
                    <Spinner size="sm" /> Loading similar products…
                </p>
            ) : (
                <ProductCardSlider
                    title={title}
                    products={products}
                    isWishlisted={isProductWishlisted}
                    addingProductId={addingProductId}
                    wishlistPendingId={wishlistPendingId}
                    onToggleWishlist={handleWishlist}
                    onQuickAdd={handleAddToCart}
                />
            )}
        </section>
    );
};

export default SimilarProducts;
