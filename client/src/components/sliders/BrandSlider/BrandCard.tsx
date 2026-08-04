import styles from "./BrandCard.module.css";
import type { Brand } from "./types";

interface BrandCardProps {
  brand: Brand;
}

const BrandCard = ({ brand }: BrandCardProps) => {
  return (
    <div className={styles.card}>
      <div className={styles.logoWrapper}>
        <img
          src={brand.logo}
          alt={brand.name}
          className={styles.logo}
        />
      </div>

      <h3>{brand.name}</h3>
    </div>
  );
};

export default BrandCard;