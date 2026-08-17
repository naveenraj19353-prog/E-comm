import { useState } from "react";
import type { Product } from "../../features/products/types";
import styles from "./ProductGrid.module.css";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import ProductCard from "../ProductCard/UniCard/ProductCard";
import { useAuth } from "../../features/auth/hooks/useAuth";
const ProductGrid = ({ products }: { products: Product[] }) => {
  const user = useAuth().user;
  const { addToCart } = useCart(user?._id, user?.tenantId);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
    user?._id,
    user?.tenantId,
  );
  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🛍️</div>
        <h2>No Products Found</h2>
        <p>We couldn't find any products matching your filters.</p>
      </div>
    );
  }
  const handleAddToCart = async (productId: string) => {
    try {
      setAddingProductId(productId);
      console.log({
        tenantId: user?.tenantId,
        userId: user?._id,
        productId,
        quantity: 1,
      })
      await addToCart({
        tenantId: user?.tenantId,
        userId: user?._id,
        productId,
        quantity: 1,
      });
    } catch (error) {
      console.error("Add to cart failed:", error);
    } finally {
      setAddingProductId(null);
    }
  };
  const handleWishlist = async (productId: string) => {
    try {
      const alreadyWishlisted = wishlist.some(
        (item) => item.productId === productId,
      );
      if (alreadyWishlisted) {
        await removeFromWishlist(productId);
      } else {
        await addToWishlist({
          tenantId: user?.tenantId,
          userId: user?._id,
          productId,
        });
      }
    } catch (error) {
      console.error("Wishlist update failed:", error);
    }
  };
  return (
    <div className={styles.grid}>
      {products.map((product) => {
        const isWishlisted = wishlist.some(
          (item) => item.productId === product?._id,
        );
        return (
          <ProductCard
            key={product?._id}
            product={product}
            isWishlisted={isWishlisted}
            onWishlist={handleWishlist}
            onAddToCart={handleAddToCart}
            isAdding={addingProductId === product?._id}
          />
        );
      })}
    </div>
  );
};
export default ProductGrid;
