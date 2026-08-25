import type { Product } from "../../features/products/types";
import styles from "./ProductDetails.module.css";
interface ProductSpecificationsProps {
    product: Product;
}
const ProductSpecifications = ({ product, }: ProductSpecificationsProps) => {
    const colors = Array.from(new Set(product.inventory
        .filter((variant) => variant.stock > 0 &&
        variant.color &&
        variant.color !== "Default")
        .map((variant) => variant.color)));
    const sizes = Array.from(new Set(product.inventory
        .filter((variant) => variant.stock > 0 &&
        variant.size &&
        variant.size !== "Default")
        .map((variant) => variant.size)));
    const totalStock = product.inventory.reduce((total, variant) => total +
        Math.max(0, variant.stock), 0);
    const specifications = [
        {
            label: "Brand",
            value: product.brand || "—",
        },
        {
            label: "Category",
            value: product.categoryName ||
                product.categoryId ||
                "—",
        },
        {
            label: "Available Colors",
            value: colors.length > 0
                ? colors.join(", ")
                : "—",
        },
        {
            label: "Available Sizes",
            value: sizes.length > 0
                ? sizes.join(", ")
                : "—",
        },
        {
            label: "Total Stock",
            value: totalStock.toString(),
        },
    ];
    return (<section className={styles.detailsSection}>
      <div className={styles.detailsHeader}>
        <span className={styles.sectionEyebrow}>
          PRODUCT INFORMATION
        </span>
        <h2>Product Details</h2>
        <p>
          Everything you need to
          know about this product.
        </p>
      </div>
      <div className={styles.specificationTable}>
        {specifications.map((specification) => (<div key={specification.label} className={styles.specRow}>
              <span>
                {specification.label}
              </span>
              <strong>
                {specification.value}
              </strong>
            </div>))}
      </div>
    </section>);
};
export default ProductSpecifications;
