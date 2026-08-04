// import ProductCard from "../ProductSlider/ProductCard";
// import type { Product } from "../../features/product/types";

import type { Product } from "../../features/products/types";
import ProductCard from "../sliders/ProductSlider/ProductCard";
import styles from "./ProductGrid.module.css";

interface ProductGridProps {
  products: Product[];
}

const ProductGrid = ({ products }: ProductGridProps) => {
    console.log("Products in ProductGrid:", products); // Debugging line
  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No Products Found</h2>
        <p>Try changing your filters.</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {products.map((product) => (
        <ProductCard
          key={product._id}
          product={product}
        />
      ))}
    </div>
  );
};

export default ProductGrid;