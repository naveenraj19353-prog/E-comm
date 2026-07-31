import styles from "./FlipProductCard.module.css";

export interface FlipProductCardProps {
  badge?: string;
  badgeType?: "new" | "hot" | "sale" | string;

  image?: string;
  emoji?: string;

  category?: string;
  title?: string;
  description?: string;

  features?: string[];

  price?: number;
  oldPrice?: number;

  rating?: number;
  reviews?: number;

  shippingText?: string;

  theme?: "blue" | "orange" | "green";

  onAddToCart?: () => void;
  label?:string
}

const FlipProductCard = ({
  badge = "New",
  badgeType = "new",
  image,
  emoji,
  category,
  title,
  description,
  features,
  price,
  oldPrice,
  rating,
  reviews,
  shippingText = "Free Shipping",
  theme = "blue",
  onAddToCart,
  label
}: FlipProductCardProps) => {
  const themeClass =
    theme === "orange"
      ? styles.cardB
      : theme === "green"
      ? styles.cardC
      : styles.cardA;

  const badgeClass =
    badgeType === "hot"
      ? styles.badgeHot
      : badgeType === "sale"
      ? styles.badgeSale
      : styles.badgeNew;

  return (
    <div className={`${styles.flipCard} ${themeClass}`}>
      <div className={styles.flipInner}>
        {/* FRONT */}
        <div className={styles.flipFront}>
          <div className={styles.cardImg}>
            <div className={styles.cardImgBg}></div>

            {badge && (
              <div className={`${styles.cardBadge} ${badgeClass}`}>
                {badge}
              </div>
            )}

            {image ? (
              <img
                src={image}
                alt={title}
                className={styles.productImage}
              />
            ) : (
              <span className={styles.cardEmoji}>{emoji}</span>
            )}
          </div>

          <div className={styles.cardInfo}>
            <div className={styles.cardCategory}>{category}</div>

            <div className={styles.cardName}>{title}</div>

            <div className={styles.cardPriceRow}>
              {price && <div>
                <span className={styles.cardPrice}>
                  ${price}
                </span>

                {oldPrice && (
                  <span className={styles.cardPriceOld}>
                    ${oldPrice}
                  </span>
                )}
              </div>}

              <div className={styles.cardRating}>
                <span className={styles.stars}>
                  {"★".repeat(Math.round(rating))}
                </span>

                <span>{rating}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className={styles.flipBack}>
          <div className={styles.backTag}>
            {title} · {category}
          </div>

          <div className={styles.backName}>
            {title}
          </div>

          <div className={styles.backDesc}>
            {description}
          </div>

          {features && <ul className={styles.backFeatures}>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>}

          {price && <div className={styles.backPrice}>
            <span className={styles.backPriceMain}>
              ${price}
            </span>

            <span className={styles.backPricePeriod}>
              {shippingText}
            </span>
          </div>}

          <button
            className={styles.backCta}
            onClick={onAddToCart}
          >
            {/* Add to Cart 🛒 */}
            {label}
          </button>

          {reviews && <div className={styles.reviewRow}>
            <span className={styles.stars}>
              {"★".repeat(Math.round(rating))}
            </span>

            <span className={styles.reviewText}>
              {rating} ({reviews} Reviews)
            </span>
          </div>}
        </div>
      </div>
    </div>
  );
};

export default FlipProductCard;