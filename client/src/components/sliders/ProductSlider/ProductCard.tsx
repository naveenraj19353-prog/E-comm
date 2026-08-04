import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import type { Product } from "../../../features/products/types";

interface ProductCardProps {
  product: Product;
  onWishlist?: (id: string) => void;
  onAddToCart?: (id: string) => void;
}

const ProductCard = ({
  product,
  onWishlist,
  onAddToCart,
}: ProductCardProps) => {
  return (
    <div className={styles.card}>
      {product.discountPercentage > 0 && (
        <span className={styles.discount}>
          -{product.discountPercentage}%
        </span>
      )}

      <button
        className={styles.wishlist}
        onClick={() => onWishlist?.(product._id)}
      >
        <Heart size={18} />
      </button>

      <div className={styles.imageWrapper}>
        <img
          src={product.images[0]}
          alt={product.name}
          className={styles.image}
        />
      </div>

      <div className={styles.content}>
        <h3>{product.name}</h3>

        <div className={styles.rating}>
          <Star
            size={14}
            fill="#fbbf24"
            stroke="#fbbf24"
          />
          <span>
            {product.averageRating} ({product.reviewCount})
          </span>
        </div>

        <div className={styles.price}>
          <span className={styles.current}>
            ₹{product.finalPrice.toLocaleString()}
          </span>

          <span className={styles.old}>
            ₹{product.price.toLocaleString()}
          </span>
        </div>

        <button
          className={styles.cartBtn}
          onClick={() => onAddToCart?.(product._id)}
          disabled={product.stock === 0}
        >
          <ShoppingCart size={18} />

          {product.stock > 0 ? "Add To Cart" : "Out Of Stock"}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;