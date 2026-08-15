import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useCreateProduct } from "../hooks/useTenantProducts";

import styles from "../styles/CreateProduct.module.css";

export default function CreateProduct() {
  const navigate = useNavigate();
  const { tenantId } = useParams();

  const createProductMutation = useCreateProduct();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [price, setPrice] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [stock, setStock] = useState("");

  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [images, setImages] = useState("");

  const [error, setError] = useState("");

  /* =====================================================
     FINAL PRICE
  ===================================================== */

  const priceNumber = Number(price) || 0;
  const discountNumber = Number(discountPercentage) || 0;

  const finalPrice = priceNumber - (priceNumber * discountNumber) / 100;

  /* =====================================================
     SUBMIT
  ===================================================== */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    if (!tenantId) {
      setError("Tenant ID is missing.");
      return;
    }

    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }

    if (!description.trim()) {
      setError("Product description is required.");
      return;
    }

    if (!categoryId.trim()) {
      setError("Category is required.");
      return;
    }

    if (!price || Number(price) <= 0) {
      setError("Enter a valid price.");
      return;
    }

    if (!stock || Number(stock) < 0) {
      setError("Enter a valid stock quantity.");
      return;
    }

    try {
      await createProductMutation.mutateAsync({
        tenantId,
        name: name.trim(),
        description: description.trim(),
        categoryId: categoryId.trim(),

        price: Number(price),

        discountPercentage: Number(discountPercentage) || 0,

        stock: Number(stock),

        sizes: sizes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),

        colors: colors
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),

        images: images
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });

      navigate(`/admin/tenants/${tenantId}/products`);
    } catch (error) {
      console.error("Failed to create product:", error);

      setError(error?.response?.data?.detail || "Failed to create product.");
    }
  };

  /* =====================================================
     BACK
  ===================================================== */

  const handleBack = () => {
    if (tenantId) {
      navigate(`/admin/tenants/${tenantId}/products`);
    } else {
      navigate("/admin/tenants");
    }
  };

  return (
    <div className={styles.page}>
      {/* =================================================
          HEADER
      ================================================= */}

      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
          >
            ← Back to Products
          </button>

          <span className={styles.eyebrow}>{tenantId || "TENANT"}</span>

          <h1>Create Product</h1>

          <p>Add a new product to this tenant's store.</p>
        </div>
      </div>

      {/* =================================================
          FORM
      ================================================= */}

      <form className={styles.formCard} onSubmit={handleSubmit}>
        {/* =================================================
            PRODUCT INFORMATION
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Product Information</h2>

              <p>Enter the basic information about your product.</p>
            </div>
          </div>

          <div className={styles.grid}>
            {/* PRODUCT NAME */}

            <div className={`${styles.field} ${styles.full}`}>
              <label htmlFor="product-name">
                Product Name
                <span>*</span>
              </label>

              <input
                id="product-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: Premium Wireless Headphones"
              />
            </div>

            {/* DESCRIPTION */}

            <div className={`${styles.field} ${styles.full}`}>
              <label htmlFor="product-description">
                Description
                <span>*</span>
              </label>

              <textarea
                id="product-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe your product..."
                rows={5}
              />
            </div>

            {/* CATEGORY */}

            <div className={styles.field}>
              <label htmlFor="category">
                Category
                <span>*</span>
              </label>

              <input
                id="category"
                type="text"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                placeholder="Example: ELECTRONICS"
              />

              <small>Enter the category ID.</small>
            </div>

            {/* TENANT */}

            <div className={styles.field}>
              <label>Tenant</label>

              <input type="text" value={tenantId || ""} disabled />

              <small>Product will be created for this tenant.</small>
            </div>
          </div>
        </section>

        {/* =================================================
            PRICING
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Pricing</h2>

              <p>Set the product price and discount.</p>
            </div>
          </div>

          <div className={styles.grid}>
            {/* PRICE */}

            <div className={styles.field}>
              <label htmlFor="price">
                Price
                <span>*</span>
              </label>

              <div className={styles.inputWithPrefix}>
                <span>₹</span>

                <input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* DISCOUNT */}

            <div className={styles.field}>
              <label htmlFor="discount">Discount</label>

              <div className={styles.inputWithSuffix}>
                <input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercentage}
                  onChange={(event) =>
                    setDiscountPercentage(event.target.value)
                  }
                  placeholder="0"
                />

                <span>%</span>
              </div>
            </div>

            {/* FINAL PRICE */}

            <div className={styles.pricePreview}>
              <span>Final Price</span>

              <strong>
                ₹
                {finalPrice.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>
        </section>

        {/* =================================================
            INVENTORY
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Inventory</h2>

              <p>Set the available stock quantity.</p>
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="stock">
                Stock Quantity
                <span>*</span>
              </label>

              <input
                id="stock"
                type="number"
                min="0"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </section>

        {/* =================================================
            VARIANTS
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Variants</h2>

              <p>Add sizes and colors separated by commas.</p>
            </div>
          </div>

          <div className={styles.grid}>
            {/* SIZES */}

            <div className={styles.field}>
              <label htmlFor="sizes">Sizes</label>

              <input
                id="sizes"
                type="text"
                value={sizes}
                onChange={(event) => setSizes(event.target.value)}
                placeholder="S, M, L, XL"
              />

              <small>Example: S, M, L, XL</small>
            </div>

            {/* COLORS */}

            <div className={styles.field}>
              <label htmlFor="colors">Colors</label>

              <input
                id="colors"
                type="text"
                value={colors}
                onChange={(event) => setColors(event.target.value)}
                placeholder="Black, White, Blue"
              />

              <small>Example: Black, White, Blue</small>
            </div>
          </div>
        </section>

        {/* =================================================
            IMAGES
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Product Images</h2>

              <p>Add image URLs. Use one URL per line.</p>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="images">Image URLs</label>

            <textarea
              id="images"
              value={images}
              onChange={(event) => setImages(event.target.value)}
              placeholder={`https://example.com/product-1.jpg
https://example.com/product-2.jpg`}
              rows={5}
            />

            <small>
              The first image will be used as the primary product image.
            </small>
          </div>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && <div className={styles.error}>{error}</div>}

        {/* =================================================
            FOOTER
        ================================================= */}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleBack}
            disabled={createProductMutation.isPending}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.createButton}
            disabled={createProductMutation.isPending}
          >
            {createProductMutation.isPending ? "Creating..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
