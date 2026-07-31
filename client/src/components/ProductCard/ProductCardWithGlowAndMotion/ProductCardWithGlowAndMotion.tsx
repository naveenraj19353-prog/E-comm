import { useState } from "react";
import styles from "./ProductCardWithGlowAndMotion.module.css";

interface ProductCardProps {
  image: string;
  emoji?: string;
  brand: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: string;
  colours: string[];
  theme?: "cyan" | "pink" | "purple";
}

const ProductCard = ({
  image,
  emoji,
  brand,
  name,
  description,
  price,
  oldPrice,
  rating,
  reviews,
  badge,
  colours,
  theme = "cyan",
}: ProductCardProps) => {
  const [selectedColour, setSelectedColour] = useState(colours[0]);
  const [wishlist, setWishlist] = useState(false);

  const discount =
    oldPrice && oldPrice > price
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : null;

  return (
    <div
      className={`${styles.productCard} ${
        theme === "cyan"
          ? styles.cardCyan
          : theme === "pink"
          ? styles.cardPink
          : styles.cardPurple
      }`}
    >
      <div className={styles.cardBody}>
        <div
          className={styles.cardImg}
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className={styles.cardImgGlow}></div>

          {badge && (
            <div className={styles.cardBadge}>
              {badge}
            </div>
          )}

          <div
            className={styles.cardWishlist}
            onClick={() => setWishlist(!wishlist)}
          >
            {wishlist ? "♥" : "♡"}
          </div>

          {!image && (
            <div className={styles.productEmoji}>
              {emoji}
            </div>
          )}
        </div>

        <div className={styles.cardInfo}>
          <div className={styles.cardBrand}>
            {brand}
          </div>

          <div className={styles.cardName}>
            {name}
          </div>

          <div className={styles.cardDesc}>
            {description}
          </div>

          <div className={styles.cardRating}>
            <span className={styles.stars}>
              {"★".repeat(Math.round(rating))}
            </span>

            <span className={styles.ratingN}>
              {rating} ({reviews.toLocaleString()})
            </span>
          </div>

          <div className={styles.cardPriceRow}>
            <div>
              <span className={styles.priceMain}>
                ${price}
              </span>

              {oldPrice && (
                <>
                  <span className={styles.priceOld}>
                    ${oldPrice}
                  </span>

                  {discount && (
                    <span className={styles.priceSave}>
                      -{discount}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={styles.swatches}>
            {colours.map((colour) => (
              <div
                key={colour}
                className={`${styles.swatch} ${
                  selectedColour === colour
                    ? styles.active
                    : ""
                }`}
                style={{ background: colour }}
                onClick={() =>
                  setSelectedColour(colour)
                }
              />
            ))}
          </div>

          <button className={styles.cardCta}>
            🛒 Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;