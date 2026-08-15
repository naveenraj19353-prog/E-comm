import { useState } from "react";
import { Heart } from "lucide-react";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useCart } from "../../features/cart/hooks/useCart";
import styles from "./Wishlist.module.css";
import ProductCard from "../../components/ProductCard/UniCard/ProductCard";
import { useAuth } from "../../features/auth/hooks/useAuth";
const Wishlist = () => {
  const user = useAuth().user;
  const { wishlist, wishlistCount, isLoading, removeFromWishlist } =
    useWishlist(user?._id, user?.tenantId);
  const { addToCart } = useCart(user?._id, user?.tenantId);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Heart size={28} />
        <span>Loading your wishlist...</span>
      </div>
    );
  }
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
  const handleAddToCart = async (productId: string) => {
    try {
      setAddingProductId(productId);
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
      await removeFromWishlist(productId);
    } catch (error) {
      console.error("Remove from wishlist failed:", error);
    }
  };
  return (
    <div className={styles.container}>
      
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
      
      <div className={styles.grid}>
        {wishlist.map((item) => {
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
