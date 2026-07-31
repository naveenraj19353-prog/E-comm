
import styles from "./ProductCard.module.css";
interface ProductCardProps {
  badge?: string;
  image: string;

  category: string;
  title: string;
  description: string;

  features: string[];

  oldPrice?: number;
  price: number;

  rating: number;
  reviews: number;

  stock: string;

  onAddToCart?: () => void;
}

const ProductCard = ({
  badge,
  image,
  category,
  title,
  description,
  features,
  oldPrice,
  price,
  rating,
  reviews,
  stock,
  onAddToCart,
}: ProductCardProps) => {
  return (
   <div className={styles.productCard}>
  {badge && (
    <div className={styles.productBadge}>
      {badge}
    </div>
  )}

  <div className={styles.productTiltEffect}>
    <div className={styles.productImage}>
      <img src={image} alt={title} />
    </div>
  </div>

  <div className={styles.productInfo}>
    <div className={styles.productCategory}>
      {category}
    </div>

    <h2 className={styles.productTitle}>
      {title}
    </h2>

    <div className={styles.productDescription}>
      <p>{description}</p>
    </div>

    <div className={styles.productFeatures}>
      {features.map((feature) => (
        <span
          key={feature}
          className={styles.feature}
        >
          {feature}
        </span>
      ))}
    </div>

    <div className={styles.productBottom}>
      <div className={styles.productPrice}>
        {oldPrice && (
          <span className={styles.priceWas}>
            ${oldPrice}
          </span>
        )}

        <span className={styles.priceNow}>
          ${price}
        </span>
      </div>

      <button
        className={styles.productButton}
        onClick={onAddToCart}
      >
        <span className={styles.buttonText}>
          Add to Cart
        </span>
      </button>
    </div>

    <div className={styles.productMeta}>
      <div className={styles.productRating}>
        {Array.from({ length: rating }).map((_, i) => (
          <span key={i}>⭐</span>
        ))}
        <span className={styles.ratingCount}>
          {reviews} Reviews
        </span>
      </div>

      <div className={styles.productStock}>
        {stock}
      </div>
    </div>
  </div>
</div>
  );
};

export default ProductCard;