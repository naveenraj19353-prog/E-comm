import { useState } from "react";
import {
  Heart,
  ShoppingBag,
  Star,
  Minus,
  Plus,
} from "lucide-react";



import styles from "./ProductDetails.module.css";
import type { Product } from "../../features/products/types";

interface ProductInfoProps {
  product: Product;

  isWishlisted: boolean;

  isAddingToCart: boolean;

  onAddToCart: (
    productId: string,
    quantity: number
  ) => void | Promise<void>;

  onWishlist: (
    productId: string
  ) => void | Promise<void>;
}

const ProductInfo = ({
  product,
  isWishlisted,
  isAddingToCart,
  onAddToCart,
  onWishlist,
}: ProductInfoProps) => {
  const [selectedColor, setSelectedColor] = useState(
    product.colors?.[0] || ""
  );

  const [selectedSize, setSelectedSize] = useState(
    product.sizes?.[0] || ""
  );

  const [quantity, setQuantity] = useState(1);

  const increaseQuantity = () => {
    setQuantity((value) =>
      Math.min(value + 1, product.stock)
    );
  };

  const decreaseQuantity = () => {
    setQuantity((value) =>
      Math.max(1, value - 1)
    );
  };

  return (
    <div className={styles.info}>
      {/* Category */}
      <div className={styles.category}>
        {product.categoryId}
      </div>

      {/* Title */}
      <h1 className={styles.title}>
        {product.name}
      </h1>

      {/* Rating */}
      <div className={styles.ratingRow}>
        <div className={styles.stars}>
          {Array.from({ length: 5 }, (_, index) => (
            <Star
              key={index}
              size={17}
              fill={
                index <
                Math.round(product.averageRating)
                  ? "currentColor"
                  : "none"
              }
            />
          ))}
        </div>

        <strong className={styles.ratingValue}>
          {product.averageRating.toFixed(1)}
        </strong>

        <span className={styles.reviewCount}>
          ({product.reviewCount} reviews)
        </span>
      </div>

      {/* Price */}
      <div className={styles.priceSection}>
        <span className={styles.currentPrice}>
          ₹{product.finalPrice.toLocaleString("en-IN")}
        </span>

        {product.discountPercentage > 0 && (
          <>
            <span className={styles.originalPrice}>
              ₹{product.price.toLocaleString("en-IN")}
            </span>

            <span className={styles.discount}>
              {product.discountPercentage}% OFF
            </span>
          </>
        )}
      </div>

      {/* Description */}
      <p className={styles.description}>
        {product.description}
      </p>

      <div className={styles.divider} />

      {/* Color */}
      {product.colors?.length > 0 && (
        <div className={styles.optionGroup}>
          <div className={styles.optionHeading}>
            <span>Color</span>

            <strong>{selectedColor}</strong>
          </div>

          <div className={styles.colorOptions}>
            {product.colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.colorOption} ${
                  selectedColor === color
                    ? styles.optionSelected
                    : ""
                }`}
                onClick={() =>
                  setSelectedColor(color)
                }
              >
                <span className={styles.colorDot} />
                {color}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size */}
      {product.sizes?.length > 0 && (
        <div className={styles.optionGroup}>
          <div className={styles.optionHeading}>
            <span>Size</span>

            <button
              type="button"
              className={styles.sizeGuide}
            >
              Size Guide
            </button>
          </div>

          <div className={styles.sizeOptions}>
            {product.sizes.map((size) => (
              <button
                key={size}
                type="button"
                className={`${styles.sizeOption} ${
                  selectedSize === size
                    ? styles.optionSelected
                    : ""
                }`}
                onClick={() =>
                  setSelectedSize(size)
                }
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stock */}
      <div
        className={
          product.stock > 0
            ? styles.stockAvailable
            : styles.stockUnavailable
        }
      >
        <span />

        {product.stock > 0
          ? `${product.stock} items available`
          : "Out of stock"}
      </div>

      {/* Actions */}
      <div className={styles.actionRow}>
        <div className={styles.quantityControl}>
          <button
            type="button"
            disabled={quantity <= 1}
            onClick={decreaseQuantity}
          >
            <Minus size={15} />
          </button>

          <span>{quantity}</span>

          <button
            type="button"
            disabled={
              quantity >= product.stock
            }
            onClick={increaseQuantity}
          >
            <Plus size={15} />
          </button>
        </div>

        <button
          type="button"
          className={styles.addToCart}
          disabled={
            product.stock <= 0 ||
            isAddingToCart
          }
          onClick={() =>
            onAddToCart(
              product._id,
              quantity
            )
          }
        >
          <ShoppingBag size={18} />

          {isAddingToCart
            ? "Adding..."
            : "Add to Cart"}
        </button>

        <button
          type="button"
          className={`${styles.wishlistButton} ${
            isWishlisted
              ? styles.wishlistActive
              : ""
          }`}
          onClick={() =>
            onWishlist(product._id)
          }
          aria-label={
            isWishlisted
              ? "Remove from wishlist"
              : "Add to wishlist"
          }
        >
          <Heart
            size={20}
            fill={
              isWishlisted
                ? "currentColor"
                : "none"
            }
          />
        </button>
      </div>
    </div>
  );
};

export default ProductInfo;