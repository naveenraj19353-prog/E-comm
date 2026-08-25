import styles from "./HomeProductCard.module.css";
import { getFirstProductImage, isProductOutOfStock, } from "../../features/products/inventory";
import type { Product } from "../../features/products/types";
interface HomeProductCardProps {
    product: Product;
    onClick?: () => void;
}
const HomeProductCard = ({ product, onClick }: HomeProductCardProps) => {
    const image = getFirstProductImage(product.images);
    const outOfStock = isProductOutOfStock(product);
    return (<div className={styles.card} onClick={onClick}>
      <div className={styles.imageWrapper}>
        <img src={image} alt={product.name} className={styles.image}/>
        {product.discountPercentage > 0 && (<span className={styles.discount}>
            {Math.round(product.discountPercentage)}% OFF
          </span>)}
        {outOfStock && (<div className={styles.outOfStock}>Out of Stock</div>)}
      </div>
      <div className={styles.content}>
        <h3 className={styles.name}>{product.name}</h3>
        <div className={styles.rating}>
          <span>★</span>
          <span>{product.averageRating?.toFixed(1) || "0.0"}</span>
          <span className={styles.reviews}>({product.reviewCount || 0})</span>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.price}>
            ₹{product.finalPrice.toLocaleString("en-IN")}
          </span>
          {product.price > product.finalPrice && (<span className={styles.originalPrice}>
              ₹{product.price.toLocaleString("en-IN")}
            </span>)}
        </div>
      </div>
    </div>);
};
export default HomeProductCard;
