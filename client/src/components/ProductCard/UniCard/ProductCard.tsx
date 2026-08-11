import {
  Heart,
  ShoppingCart,
  Star,
} from "lucide-react";

import styles from "./ProductCard.module.css";

export interface ProductCardData {
  _id: string;
  name: string;
  price: number;
  finalPrice: number;
  discountPercentage: number;
  images: string[];
  stock: number;
  averageRating: number;
  reviewCount: number;
}

interface ProductCardProps {
  product: ProductCardData;
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
  const handleWishlist = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    onWishlist?.(product._id);
  };

  const handleAddToCart = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    onAddToCart?.(product._id);
  };

  return (
    <div className={styles.card}>
      {/* Discount */}
      {product.discountPercentage > 0 && (
        <span className={styles.discount}>
          -{product.discountPercentage}%
        </span>
      )}

      {/* Wishlist */}
      <button
        type="button"
        className={`${styles.wishlist} ${
          isWishlisted
            ? styles.wishlisted
            : ""
        }`}
        onClick={handleWishlist}
        aria-label={
          isWishlisted
            ? "Remove from wishlist"
            : "Add to wishlist"
        }
      >
        <Heart
          size={18}
          fill={
            isWishlisted
              ? "currentColor"
              : "none"
          }
        />
      </button>

      {/* Image */}
      <div className={styles.imageWrapper}>
        <img
          src={product.images[0]}
          alt={product.name}
          className={styles.image}
        />
      </div>

      {/* Content */}
      <div className={styles.content}>
        <h3>{product.name}</h3>

        {/* Rating */}
        {product.averageRating ? <div className={styles.rating}>
          <Star
            size={14}
            fill="#fbbf24"
            stroke="#fbbf24"
          />

          <span>
            {product.averageRating} (
            {product.reviewCount})
          </span>
        </div>:""}

        {/* Price */}
        { product.finalPrice && <div className={styles.price}>
          <span className={styles.current}>
            ₹  {product.finalPrice.toLocaleString()}
          </span>

          {product.price >
            product.finalPrice && (
            <span className={styles.old}>
              ₹{product.price.toLocaleString()}
            </span>
          )}
        </div>}

        {/* Cart */}
        <button
          type="button"
          className={styles.cartBtn}
          onClick={handleAddToCart}
          disabled={
            product.stock === 0 ||
            isAdding
          }
        >
          <ShoppingCart size={18} />

          {product.stock === 0
            ? "Out Of Stock"
            : isAdding
              ? "Adding..."
              : "Add To Cart"}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
