import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import type { Product } from "../../../features/products/types";
import {
  getFirstProductImage,
  isProductOutOfStock,
} from "../../../features/products/inventory";

interface ProductCardProps {
  product: Product;
  isWishlisted?: boolean;
  onWishlist?: (id: string) => void;
  onAddToCart?: (id: string) => void;
  isAdding?: boolean;
}

const ProductCard = ({
  product,
  isWishlisted = false,
  onWishlist,
  onAddToCart,
  isAdding = false,
}: ProductCardProps) => {
  const outOfStock = isProductOutOfStock(product);
  const image = getFirstProductImage(product.images);

  const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onWishlist?.(product._id);
  };

  const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (outOfStock) {
      return;
    }
    onAddToCart?.(product._id);
  };

  return (
    <div className={styles.card}>
      {product.discountPercentage > 0 && (
        <span className={styles.discount}>-{product.discountPercentage}%</span>
      )}
      <button
        type="button"
        className={`${styles.wishlist} ${
          isWishlisted ? styles.wishlisted : ""
        }`}
        onClick={handleWishlist}
        aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
      </button>
      <div className={styles.imageWrapper}>
        <img src={image} alt={product.name} className={styles.image} />
      </div>
      <div className={styles.content}>
        <h3>{product.name}</h3>
        <div className={styles.rating}>
          <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
          <span>
            {product.averageRating} ({product.reviewCount})
          </span>
        </div>
        <div className={styles.price}>
          <span className={styles.current}>
            ₹{product.finalPrice.toLocaleString()}
          </span>
          {product.price > product.finalPrice && (
            <span className={styles.old}>
              ₹{product.price.toLocaleString()}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.cartBtn}
          onClick={handleAddToCart}
          disabled={outOfStock || isAdding}
        >
          <ShoppingCart size={18} />
          {outOfStock ? "Out Of Stock" : isAdding ? "Adding..." : "Add To Cart"}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
