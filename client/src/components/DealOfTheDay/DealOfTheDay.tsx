import styles from "./DealOfTheDay.module.css";
import Countdown from "./Countdown";
import ProductCard from "../sliders/ProductSlider/ProductCard";
import type { Product } from "../sliders/ProductSlider/types";

interface Props {
  products: Product[];
}

const DealOfTheDay = ({ products }: Props) => {
  return (
    <section className={styles.section}>
      <div className={styles.left}>

        <span className={styles.tag}>
          🔥 Limited Time
        </span>

        <h2>Deal Of The Day</h2>

        <p>
          Grab your favourite fashion at unbeatable prices.
          Hurry before the offer ends!
        </p>

        <Countdown />

        <button className={styles.button}>
          Shop Now
        </button>

      </div>

      <div className={styles.right}>

        {products.slice(0,4).map(product=>(
          <ProductCard
            key={product.id}
            product={product}
          />
        ))}

      </div>
    </section>
  );
};

export default DealOfTheDay;