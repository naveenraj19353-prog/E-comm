import React, { useState } from "react";
import styles from "./Productcard.module.css";

export interface Product {
  _id: string;
  name: string;
  price: number;
  finalPrice: number;
  discountPercentage: number;
  images?: string[];
  sizes?: string[];
  averageRating?: number;
  reviewCount?: number;
  isActive?: boolean;
}

interface ProductCardProps {
  product: Product;
  onToggleWishlist?: (id: string, value: boolean) => void;
  onQuickAdd?: (id: string) => void;
}

export default function ProductCard({
  product,
  onToggleWishlist,
  onQuickAdd,
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] =
    useState(false);

  const {
    _id,
    name,
    price,
    finalPrice,
    discountPercentage,
    images = [],
    sizes = [],
    averageRating,
    reviewCount = 0,
    isActive = true,
  } = product;

  const image =
    images?.find((item) => item) || "";

  const handleWishlist = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();

    const value = !isWishlisted;

    setIsWishlisted(value);

    onToggleWishlist?.(_id, value);
  };

  const handleAddToCart = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();

    onQuickAdd?.(_id);
  };

  return (
    <article
      className={`${styles.card} ${
        !isActive ? styles.inactive : ""
      }`}
    >
      {/* IMAGE SECTION */}

      <div className={styles.imageContainer}>
        {image ? (
          <img
            src={image}
            alt={name}
            className={styles.productImage}
            loading="lazy"
          />
        ) : (
          <div className={styles.noImage}>
            No Image
          </div>
        )}

        {/* IMAGE DARK GRADIENT */}

        <div className={styles.gradient} />

        {/* DISCOUNT */}

        {discountPercentage > 0 && (
          <div className={styles.discount}>
            {discountPercentage}% OFF
          </div>
        )}

        {/* WISHLIST */}

        <button
          type="button"
          className={`${styles.wishlist} ${
            isWishlisted
              ? styles.wishlistActive
              : ""
          }`}
          onClick={handleWishlist}
          aria-label={
            isWishlisted
              ? "Remove from wishlist"
              : "Add to wishlist"
          }
        >
          <HeartIcon
            filled={isWishlisted}
          />
        </button>

        {/* RATING */}

        {typeof averageRating ===
          "number" && (
          <div className={styles.rating}>
            <span>
              {averageRating.toFixed(1)}
            </span>

            <StarIcon />

            <span
              className={
                styles.ratingSeparator
              }
            />

            <span>
              {reviewCount}
            </span>
          </div>
        )}

        {/* ADD TO CART */}

        <div className={styles.cartContainer}>
          <button
            type="button"
            className={styles.cartButton}
            onClick={handleAddToCart}
          >
            <BagIcon />

            <span>
              Add to Cart
            </span>
          </button>
        </div>
      </div>

      {/* PRODUCT INFORMATION */}

      <div className={styles.info}>
        <h3 className={styles.name}>
          {name}
        </h3>

        {sizes.length > 0 && (
          <p className={styles.sizes}>
            Sizes: {sizes.join(", ")}
          </p>
        )}

        <div className={styles.priceRow}>
          <span className={styles.finalPrice}>
            ₹
            {finalPrice.toLocaleString(
              "en-IN"
            )}
          </span>

          {price > finalPrice && (
            <span
              className={
                styles.originalPrice
              }
            >
              ₹
              {price.toLocaleString(
                "en-IN"
              )}
            </span>
          )}

          {discountPercentage > 0 && (
            <span
              className={
                styles.discountPill
              }
            >
              {discountPercentage}% OFF
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/* =========================================
   HEART
========================================= */

function HeartIcon({
  filled,
}: {
  filled: boolean;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={
        filled
          ? "currentColor"
          : "none"
      }
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================
   STAR
========================================= */

function StarIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17l-6.2 3.7 1.6-6.9-5.3-.7L12 2z" />
    </svg>
  );
}

/* =========================================
   BAG
========================================= */

function BagIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M6 8h12l1 12H5L6 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M9 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}