import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Product } from "../../features/products/types";
import styles from "./ProductGrid.module.css";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useNavigateToLogin } from "../../features/auth/hooks/useNavigateToLogin";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import ProductCard from "../ProductCard/UniCard/ProductCard";
interface ProductGridProps {
    products: Product[];
}
const ProductGrid = ({ products, }: ProductGridProps) => {
    const layoutSettings = useLayoutSettings();
    const user = useAuth().user;
    const navigate = useNavigate();
    const navigateToLogin = useNavigateToLogin();
    const { tenantId: storeTenantId, tenantSlug } = useStorefrontTenant();
    const tenantId = user?.tenantId || storeTenantId;
    const userId = user?._id ?? "";
    const { addToCart } = useCart(userId, tenantId);
    const [addingProductId, setAddingProductId,] = useState<string | null>(null);
    const { wishlist, addToWishlist, removeFromWishlist, } = useWishlist(userId, tenantId);
    if (products.length === 0) {
        return (<div className={styles.empty}>
        <div className={styles.emptyIcon}>
          🛍️
        </div>
        <h2>No Products Found</h2>
        <p>
          We couldn't find any products
          matching your filters.
        </p>
      </div>);
    }
    const handleAddToCart = async (productId: string, variantId: string, color: string, size: string) => {
        if (!userId || !tenantId) {
            navigateToLogin();
            return;
        }
        try {
            setAddingProductId(productId);
            const payload = {
                tenantId,
                userId,
                productId,
                variantId,
                quantity: 1,
                color,
                size,
            };
            console.log("ADD TO CART:", payload);
            await addToCart(payload);
        }
        catch (error) {
            console.error("Add to cart failed:", error);
        }
        finally {
            setAddingProductId(null);
        }
    };
    const handleWishlist = async (productId: string) => {
        if (!userId || !tenantId) {
            navigateToLogin();
            return;
        }
        try {
            const alreadyWishlisted = wishlist.some((item) => item.productId === productId);
            if (alreadyWishlisted) {
                await removeFromWishlist(productId);
                console.log("Removed from wishlist");
            }
            else {
                await addToWishlist({
                    tenantId,
                    userId,
                    productId,
                });
                console.log("Added to wishlist");
            }
        }
        catch (error) {
            console.error("Wishlist update failed:", error);
        }
    };
    return (<div className={`${styles.grid} ${layoutSettings.productViewMode === "list" ? styles.listView : ""}`}>
      {products.map((product) => {
            const isWishlisted = wishlist.some((item) => item.productId ===
                product._id);
            return (<ProductCard key={product._id} product={product} isWishlisted={isWishlisted} onWishlist={handleWishlist} onAddToCart={handleAddToCart} isAdding={addingProductId ===
                    product._id}/>);
        })}
    </div>);
};
export default ProductGrid;
