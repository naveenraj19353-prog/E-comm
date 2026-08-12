import type { Product } from "../../features/products/types";

import styles from "./ProductDetails.module.css";

interface ProductWithSpecifications extends Product {
  brand?: string;
  material?: string;
  pattern?: string;
  closure?: string;
  soleMaterial?: string;
  countryOfOrigin?: string;
  sku?: string;
}

interface ProductSpecificationsProps {
  product: Product;
}

const ProductSpecifications = ({
  product,
}: ProductSpecificationsProps) => {
  const productWithSpecs =
    product as ProductWithSpecifications;

  const specifications = [
    {
      label: "Brand",
      value: productWithSpecs.brand || "—",
    },
    {
      label: "Category",
      value: product.categoryId || "—",
    },
    {
      label: "Material",
      value: productWithSpecs.material || "—",
    },
    {
      label: "Pattern",
      value: productWithSpecs.pattern || "—",
    },
    {
      label: "Closure",
      value: productWithSpecs.closure || "—",
    },
    {
      label: "Sole Material",
      value:
        productWithSpecs.soleMaterial || "—",
    },
    {
      label: "Available Colors",
      value:
        product.colors?.length
          ? product.colors.join(", ")
          : "—",
    },
    {
      label: "Available Sizes",
      value:
        product.sizes?.length
          ? product.sizes.join(", ")
          : "—",
    },
    {
      label: "Country of Origin",
      value:
        productWithSpecs.countryOfOrigin || "—",
    },
    {
      label: "SKU",
      value: productWithSpecs.sku || "—",
    },
  ];

  return (
    <section className={styles.detailsSection}>
      <div className={styles.detailsHeader}>
        <span className={styles.sectionEyebrow}>
          PRODUCT INFORMATION
        </span>

        <h2>Product Details</h2>

        <p>
          Everything you need to know about this
          product.
        </p>
      </div>

      <div className={styles.specificationTable}>
        {specifications.map((specification) => (
          <div
            key={specification.label}
            className={styles.specRow}
          >
            <span>{specification.label}</span>

            <strong>
              {specification.value}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductSpecifications;