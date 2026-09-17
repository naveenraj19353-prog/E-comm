import type { Product } from "../../features/products/types";
import styles from "./ProductDetails.module.css";
interface ProductSpecificationsProps {
    product: Product;
}
const ProductSpecifications = ({ product, }: ProductSpecificationsProps) => {
    const isPlaceholderValue = (value: string) => {
        const normalized = value.trim().toLowerCase();
        return !normalized ||
            normalized === "—" ||
            normalized === "-" ||
            normalized === "default" ||
            normalized === "not specified" ||
            normalized === "unspecified" ||
            normalized === "n/a";
    };
    const colors = Array.from(new Set(product.inventory
        .filter((variant) => variant.stock > 0 &&
        variant.color &&
        !isPlaceholderValue(variant.color))
        .map((variant) => variant.color)));
    const sizes = Array.from(new Set(product.inventory
        .filter((variant) => variant.stock > 0 &&
        variant.size &&
        !isPlaceholderValue(variant.size))
        .map((variant) => variant.size)));
    const totalStock = product.inventory.reduce((total, variant) => total +
        Math.max(0, variant.stock), 0);
    const specifications = [
        {
            label: "Brand",
            value: product.brand || "",
        },
        {
            label: "Category",
            value: product.categoryName ||
                product.categoryId ||
                "",
        },
        {
            label: "Available Colors",
            value: colors.length > 0
                ? colors.join(", ")
                : "",
        },
        {
            label: "Available Sizes",
            value: sizes.length > 0
                ? sizes.join(", ")
                : "",
        },
        {
            label: "Total Stock",
            value: totalStock > 0 ? totalStock.toString() : "",
        },
    ].filter((specification) => !isPlaceholderValue(specification.value));
    if (specifications.length === 0) {
        return null;
    }
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
