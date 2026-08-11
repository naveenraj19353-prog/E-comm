import { useState } from "react";
import { Heart } from "lucide-react";

import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useCart } from "../../features/cart/hooks/useCart";

import styles from "./Wishlist.module.css";

import ProductCard from "../../components/ProductCard/UniCard/ProductCard";

const Wishlist = () => {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

  // ============================================================
  // WISHLIST
  // ============================================================

  const { wishlist, wishlistCount, isLoading, removeFromWishlist } =
    useWishlist(userId, tenantId);

  // ============================================================
  // CART
  // ============================================================

  const { addToCart } = useCart(userId, tenantId);

  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // ============================================================
  // LOADING
  // ============================================================

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Heart size={28} />

        <span>Loading your wishlist...</span>
      </div>
    );
  }

  // ============================================================
  // EMPTY
  // ============================================================

  if (wishlist.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Heart size={38} />
        </div>

        <h1>Your Wishlist Is Empty</h1>

        <p>Save your favorite products here and come back to them anytime.</p>
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
    } finally {
      setAddingProductId(null);
    }
  };

  // ============================================================
  // REMOVE FROM WISHLIST
  // ============================================================

  const handleWishlist = async (productId: string) => {
    try {
      await removeFromWishlist(productId);
    } catch (error) {
      console.error("Remove from wishlist failed:", error);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className={styles.container}>
      {/* Header */}

      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Heart size={15} />
          Saved For Later
        </div>

        <h1>My Wishlist</h1>

        <p>
          {wishlistCount} {wishlistCount === 1 ? "product" : "products"} saved
        </p>
      </div>

      {/* Product Grid */}

      <div className={styles.grid}>
        {wishlist.map((item) => {
          /*
           * Convert WishlistItem into the
           * common ProductCardData shape.
           */

          const product = {
            _id: item.productId,
            name: item.name,
            price: item.price,
            finalPrice: item.price,
            discountPercentage: 0,
            images: [item.image],
            stock: item.stock,
            averageRating: 0,
            reviewCount: 0,
          };

          return (
            <ProductCard
              key={item.productId}
              product={product}
              isWishlisted={true}
              onWishlist={handleWishlist}
              onAddToCart={handleAddToCart}
              isAdding={addingProductId === item.productId}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Wishlist;
