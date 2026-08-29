import type { Product } from "../../features/products/types";
import styles from "./ProductGrid.module.css";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import { useStorefrontProductActions } from "../../features/storefront/hooks/useStorefrontProductActions";
import ProductCard from "../ProductCard/UniCard/ProductCard";

interface ProductGridProps {
    products: Product[];
}

const ProductGrid = ({ products }: ProductGridProps) => {
    const layoutSettings = useLayoutSettings();
    const {
        addingProductId,
        toggleWishlist,
        handleAddToCart,
        isProductWishlisted,
    } = useStorefrontProductActions({ trackAddingProductId: true });

    if (products.length === 0) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}>🛍️</div>
                <h2>No Products Found</h2>
                <p>We couldn't find any products matching your filters.</p>
            </div>
        );
    }

    return (
        <div className={`${styles.grid} ${layoutSettings.productViewMode === "list" ? styles.listView : ""}`}>
            {products.map((product) => (
                <ProductCard
                    key={product._id}
                    product={product}
                    isWishlisted={isProductWishlisted(product._id)}
                    onWishlist={toggleWishlist}
                    onAddToCart={handleAddToCart}
                    isAdding={addingProductId === product._id}
                />
            ))}
        </div>
    );
};

export default ProductGrid;
