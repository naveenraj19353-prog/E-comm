import { useState } from "react";

import type { Product } from "../../features/products/types";

import styles from "./ProductGrid.module.css";

import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";

import ProductCard from "../ProductCard/UniCard/ProductCard";

const ProductGrid = ({ products }: { products: Product[] }) => {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

  // ============================================================
  // CART
  // ============================================================

  const { addToCart } = useCart(userId, tenantId);

  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // ============================================================
  // WISHLIST
  // ============================================================

  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
    userId,
    tenantId
  );

  // ============================================================
  // EMPTY
  // ============================================================

  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🛍️</div>

        <h2>No Products Found</h2>

        <p>We couldn't find any products matching your filters.</p>
      </div>
    );
  }

  // ============================================================
  // ADD TO CART
  // ============================================================

  const handleAddToCart = async (productId: string) => {
    try {
      setAddingProductId(productId);

      await addToCart({
        tenantId,
        userId,
        productId,
        quantity: 1,
      });
    } catch (error) {
      console.error("Add to cart failed:", error);

      alert("Unable to add product to cart");
    } finally {
      setAddingProductId(null);
    }
  };

  // ============================================================
  // WISHLIST TOGGLE
  // ============================================================

  const handleWishlist = async (productId: string) => {
    try {
      const alreadyWishlisted = wishlist.some(
        (item) => item.productId === productId
      );

      if (alreadyWishlisted) {
        await removeFromWishlist(productId);
      } else {
        await addToWishlist({
          tenantId,
          userId,
          productId,
        });
      }
    } catch (error) {
      console.error("Wishlist update failed:", error);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className={styles.grid}>
      {products.map((product) => {
        const isWishlisted = wishlist.some(
          (item) => item.productId === product._id
        );

        return (
          <ProductCard
            key={product._id}
            product={product}
            isWishlisted={isWishlisted}
            onWishlist={handleWishlist}
            onAddToCart={handleAddToCart}
            isAdding={addingProductId === product._id}
          />
        );
      })}
    </div>
  );
};

export default ProductGrid;
