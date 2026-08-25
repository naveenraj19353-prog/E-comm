import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useCreateProduct } from "../hooks/useTenantProducts";
import styles from "../styles/CreateProduct.module.css";

interface InventoryRow {
  variantId: string;
  color: string;
  size: string;
  stock: string;
}

interface ColorImages {
  [color: string]: string[];
}

interface ColorImageNames {
  [color: string]: string[];
}

export default function CreateProduct() {
  const navigate = useNavigate();
  const { tenantId } = useParams();

  const createProductMutation = useCreateProduct();

  /* =====================================================
     FILE INPUT
  ===================================================== */

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUploadColor, setImageUploadColor] = useState("");

  /* =====================================================
     PRODUCT INFORMATION
  ===================================================== */

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");

  /* =====================================================
     PRICING
  ===================================================== */

  const [basePrice, setBasePrice] = useState("");
  const [marginPercentage, setMarginPercentage] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");

  /* =====================================================
     VARIANTS / INVENTORY
  ===================================================== */

  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);

  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");

  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  /* =====================================================
     COLOR IMAGES
  ===================================================== */

  const [colorImages, setColorImages] = useState<ColorImages>({});

  const [colorImageNames, setColorImageNames] = useState<ColorImageNames>({});

  /* =====================================================
     ERROR
  ===================================================== */

  const [error, setError] = useState("");

  /* =====================================================
     PRICE CALCULATION
  ===================================================== */

  const basePriceNumber = Number(basePrice) || 0;

  const marginNumber = Number(marginPercentage) || 0;

  const discountNumber = Number(discountPercentage) || 0;

  /*
   * Example:
   *
   * Base Price = 100
   * Margin = 30%
   *
   * Calculated Price =
   * 100 + (100 * 30 / 100)
   *
   * = 130
   */

  const calculatedPrice =
    basePriceNumber + (basePriceNumber * marginNumber) / 100;

  /*
   * Example:
   *
   * Calculated Price = 130
   * Discount = 10%
   *
   * Final Selling Price =
   * 130 - (130 * 10 / 100)
   *
   * = 117
   */

  const finalPrice = calculatedPrice - (calculatedPrice * discountNumber) / 100;

  /* =====================================================
     CREATE VARIANT ID
  ===================================================== */

  const createVariantId = (color: string, size: string) => {
    return `${color}-${size}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  /* =====================================================
     GET INVENTORY ROW
  ===================================================== */

  const getInventoryRow = (color: string, size: string) => {
    return inventory.find((item) => item.color === color && item.size === size);
  };

  /* =====================================================
     ADD COLOR
  ===================================================== */

  const handleAddColor = () => {
    const color = newColor.trim();

    if (!color) {
      return;
    }

    const exists = colors.some(
      (item) => item.toLowerCase() === color.toLowerCase(),
    );

    if (exists) {
      setError("This color has already been added.");
      return;
    }

    setError("");

    setColors((previous) => [...previous, color]);

    setNewColor("");

    /*
     * Create inventory rows for all
     * existing sizes.
     */

    setInventory((previous) => {
      const updated = [...previous];

      sizes.forEach((size) => {
        const exists = updated.some(
          (item) => item.color === color && item.size === size,
        );

        if (!exists) {
          updated.push({
            variantId: createVariantId(color, size),
            color,
            size,
            stock: "0",
          });
        }
      });

      return updated;
    });
  };

  /* =====================================================
     REMOVE COLOR
  ===================================================== */

  const handleRemoveColor = (color: string) => {
    setColors((previous) => previous.filter((item) => item !== color));

    setInventory((previous) => previous.filter((item) => item.color !== color));

    setColorImages((previous) => {
      const updated = { ...previous };

      delete updated[color];

      return updated;
    });

    setColorImageNames((previous) => {
      const updated = { ...previous };

      delete updated[color];

      return updated;
    });
  };

  /* =====================================================
     ADD SIZE
  ===================================================== */

  const handleAddSize = () => {
    const size = newSize.trim();

    if (!size) {
      return;
    }

    const exists = sizes.some(
      (item) => item.toLowerCase() === size.toLowerCase(),
    );

    if (exists) {
      setError("This size has already been added.");
      return;
    }

    setError("");

    setSizes((previous) => [...previous, size]);

    setNewSize("");

    /*
     * Create inventory rows for all
     * existing colors.
     */

    setInventory((previous) => {
      const updated = [...previous];

      colors.forEach((color) => {
        const exists = updated.some(
          (item) => item.color === color && item.size === size,
        );

        if (!exists) {
          updated.push({
            variantId: createVariantId(color, size),
            color,
            size,
            stock: "0",
          });
        }
      });

      return updated;
    });
  };

  /* =====================================================
     REMOVE SIZE
  ===================================================== */

  const handleRemoveSize = (size: string) => {
    setSizes((previous) => previous.filter((item) => item !== size));

    setInventory((previous) => previous.filter((item) => item.size !== size));
  };

  /* =====================================================
     UPDATE STOCK
  ===================================================== */

  const handleStockChange = (color: string, size: string, value: string) => {
    setInventory((previous) =>
      previous.map((item) =>
        item.color === color && item.size === size
          ? {
              ...item,
              stock: value,
            }
          : item,
      ),
    );
  };

  /* =====================================================
     IMAGE SELECT FOR COLOR
  ===================================================== */

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);

    if (!files.length || !imageUploadColor) {
      return;
    }

    setError("");

    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        return false;
      }

      if (file.size > 5 * 1024 * 1024) {
        return false;
      }

      return true;
    });

    if (validFiles.length !== files.length) {
      setError("Only image files up to 5 MB are allowed.");
    }

    if (!validFiles.length) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise<{
            base64: string;
            name: string;
          }>((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              resolve({
                base64: String(reader.result),
                name: file.name,
              });
            };

            reader.onerror = () => {
              reject(new Error(`Unable to read ${file.name}`));
            };

            reader.readAsDataURL(file);
          }),
      ),
    )
      .then((selectedImages) => {
        setColorImages((previous) => ({
          ...previous,

          [imageUploadColor]: [
            ...(previous[imageUploadColor] || []),

            ...selectedImages.map((item) => item.base64),
          ],
        }));

        setColorImageNames((previous) => ({
          ...previous,

          [imageUploadColor]: [
            ...(previous[imageUploadColor] || []),

            ...selectedImages.map((item) => item.name),
          ],
        }));
      })
      .catch((imageError) => {
        console.error("Failed to read images:", imageError);

        setError("Failed to load selected images.");
      })
      .finally(() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      });
  };

  /* =====================================================
     OPEN IMAGE SELECTOR
  ===================================================== */

  const handleChooseImages = (color: string) => {
    setImageUploadColor(color);

    setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  /* =====================================================
     REMOVE COLOR IMAGE
  ===================================================== */

  const handleRemoveColorImage = (color: string, index: number) => {
    setColorImages((previous) => ({
      ...previous,

      [color]: (previous[color] || []).filter(
        (_, imageIndex) => imageIndex !== index,
      ),
    }));

    setColorImageNames((previous) => ({
      ...previous,

      [color]: (previous[color] || []).filter(
        (_, imageIndex) => imageIndex !== index,
      ),
    }));
  };

  /* =====================================================
     SET COLOR PRIMARY IMAGE
  ===================================================== */

  const handleSetPrimaryImage = (color: string, index: number) => {
    if (index === 0) {
      return;
    }

    setColorImages((previous) => {
      const updated = [...(previous[color] || [])];

      const [selectedImage] = updated.splice(index, 1);

      updated.unshift(selectedImage);

      return {
        ...previous,
        [color]: updated,
      };
    });

    setColorImageNames((previous) => {
      const updated = [...(previous[color] || [])];

      const [selectedName] = updated.splice(index, 1);

      updated.unshift(selectedName);

      return {
        ...previous,
        [color]: updated,
      };
    });
  };

  /* =====================================================
     SUBMIT
  ===================================================== */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    /* ===================================================
       BASIC VALIDATION
    =================================================== */

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

    /* ===================================================
       BASE PRICE
    =================================================== */

    if (!basePrice || Number(basePrice) <= 0) {
      setError("Enter a valid base price.");
      return;
    }

    /* ===================================================
       MARGIN
    =================================================== */

    if (
      marginPercentage &&
      (Number(marginPercentage) < 0 || Number(marginPercentage) > 1000)
    ) {
      setError("Margin must be between 0 and 1000.");
      return;
    }

    /* ===================================================
       DISCOUNT
    =================================================== */

    if (
      discountPercentage &&
      (Number(discountPercentage) < 0 || Number(discountPercentage) > 100)
    ) {
      setError("Discount must be between 0 and 100.");
      return;
    }

    /* ===================================================
       COLORS
    =================================================== */

    if (!colors.length) {
      setError("Add at least one color.");
      return;
    }

    /* ===================================================
       SIZES
    =================================================== */

    if (!sizes.length) {
      setError("Add at least one size.");
      return;
    }

    /* ===================================================
       INVENTORY VALIDATION
    =================================================== */

    for (const item of inventory) {
      const stockValue = Number(item.stock);

      if (!item.variantId || !item.color || !item.size) {
        setError("Every inventory variant must have a color and size.");
        return;
      }

      if (Number.isNaN(stockValue) || stockValue < 0) {
        setError(`Enter a valid stock for ${item.color} - ${item.size}.`);
        return;
      }
    }

    /* ===================================================
       MAKE SURE EVERY COLOR/SIZE HAS INVENTORY
    =================================================== */

    for (const color of colors) {
      for (const size of sizes) {
        const row = getInventoryRow(color, size);

        if (!row) {
          setError(`Missing inventory for ${color} - ${size}.`);
          return;
        }
      }
    }

    /* ===================================================
       IMAGE VALIDATION
    =================================================== */

    for (const color of colors) {
      if (!colorImages[color] || colorImages[color].length === 0) {
        setError(`Please upload at least one image for ${color}.`);
        return;
      }
    }

    /* ===================================================
       INVENTORY PAYLOAD
    =================================================== */

    const inventoryPayload = inventory.map((item) => ({
      variantId: item.variantId,
      color: item.color,
      size: item.size,
      stock: Number(item.stock),
    }));

    /* ===================================================
       CREATE PRODUCT
    =================================================== */

    try {
      await createProductMutation.mutateAsync({
        tenantId,

        name: name.trim(),

        description: description.trim(),

        categoryId: categoryId.trim(),

        /* ================================
           PRICING
        ================================= */

        basePrice: Number(basePrice),

        marginPercentage: Number(marginPercentage) || 0,

        price: calculatedPrice,

        discountPercentage: Number(discountPercentage) || 0,

        finalPrice,

        /* ================================
           STOCK
        ================================= */

        stock: inventoryPayload.reduce((total, item) => total + item.stock, 0),

        /* ================================
           VARIANTS
        ================================= */

        sizes,

        colors,

        inventory: inventoryPayload,

        /* ================================
           IMAGES
        ================================= */

        images: colorImages,
      });

      navigate(`/admin/tenants/${tenantId}/products`);
    } catch (error) {
      console.error("Failed to create product:", error);

      if (axios.isAxiosError(error)) {
        setError(error.response?.data?.detail || "Failed to create product.");
      } else if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Failed to create product.");
      }
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

  /* =====================================================
     TOTAL STOCK
  ===================================================== */

  const totalStock = inventory.reduce(
    (total, item) => total + (Number(item.stock) || 0),
    0,
  );

  /* =====================================================
     RENDER
  ===================================================== */

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
            <span className={styles.backIcon}>←</span>
            Back to Products
          </button>

          <span className={styles.eyebrow}>{tenantId || "TENANT"}</span>

          <h1>Create Product</h1>

          <p>Add a new product to this tenant&apos;s store.</p>
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
                placeholder="Example: Premium Cotton Kurti"
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
                placeholder="Example: WOMENS_FASHION"
              />

              <small>Enter the category ID.</small>
            </div>

            {/* TENANT */}

            <div className={styles.field}>
              <label htmlFor="tenant">Tenant</label>

              <input id="tenant" type="text" value={tenantId || ""} disabled />

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

              <p>Set the base price, margin and customer discount.</p>
            </div>
          </div>

          <div className={styles.grid}>
            {/* BASE PRICE */}

            <div className={styles.field}>
              <label htmlFor="base-price">
                Base Price
                <span>*</span>
              </label>

              <div className={styles.inputWithPrefix}>
                <span>₹</span>

                <input
                  id="base-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(event) => setBasePrice(event.target.value)}
                  placeholder="100.00"
                />
              </div>

              <small>Cost/base price of the product.</small>
            </div>

            {/* MARGIN */}

            <div className={styles.field}>
              <label htmlFor="margin">
                Margin
                <span>*</span>
              </label>

              <div className={styles.inputWithSuffix}>
                <input
                  id="margin"
                  type="number"
                  min="0"
                  step="0.01"
                  value={marginPercentage}
                  onChange={(event) => setMarginPercentage(event.target.value)}
                  placeholder="30"
                />

                <span>%</span>
              </div>

              <small>Example: ₹100 + 30% = ₹130.</small>
            </div>

            {/* CALCULATED PRICE */}

            <div className={styles.pricePreview}>
              <span>Calculated Price</span>

              <strong>
                ₹
                {calculatedPrice.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
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

              <small>Optional customer discount.</small>
            </div>

            {/* FINAL PRICE */}

            <div className={styles.pricePreview}>
              <span>Final Selling Price</span>

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
            COLORS & SIZES
        ================================================= */}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Product Variants</h2>

              <p>
                Add colors and sizes. Stock is maintained separately for each
                combination.
              </p>
            </div>
          </div>

          {/* COLORS / SIZES CREATOR */}

          <div className={styles.variantCreator}>
            {/* COLOR */}

            <div className={styles.field}>
              <label htmlFor="new-color">Add Color</label>

              <div className={styles.variantInputRow}>
                <input
                  id="new-color"
                  type="text"
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddColor();
                    }
                  }}
                  placeholder="Example: Red"
                />

                <button
                  type="button"
                  className={styles.addVariantButton}
                  onClick={handleAddColor}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* SIZE */}

            <div className={styles.field}>
              <label htmlFor="new-size">Add Size</label>

              <div className={styles.variantInputRow}>
                <input
                  id="new-size"
                  type="text"
                  value={newSize}
                  onChange={(event) => setNewSize(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddSize();
                    }
                  }}
                  placeholder="Example: M"
                />

                <button
                  type="button"
                  className={styles.addVariantButton}
                  onClick={handleAddSize}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* SELECTED COLORS */}

          {colors.length > 0 && (
            <div className={styles.selectedVariants}>
              <strong>Colors</strong>

              <div className={styles.variantTags}>
                {colors.map((color) => (
                  <span key={color} className={styles.variantTag}>
                    {color}

                    <button
                      type="button"
                      onClick={() => handleRemoveColor(color)}
                      aria-label={`Remove ${color}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* SELECTED SIZES */}

          {sizes.length > 0 && (
            <div className={styles.selectedVariants}>
              <strong>Sizes</strong>

              <div className={styles.variantTags}>
                {sizes.map((size) => (
                  <span key={size} className={styles.variantTag}>
                    {size}

                    <button
                      type="button"
                      onClick={() => handleRemoveSize(size)}
                      aria-label={`Remove ${size}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* INVENTORY MATRIX */}

          {colors.length > 0 && sizes.length > 0 && (
            <div className={styles.inventorySection}>
              <div className={styles.inventoryHeader}>
                <div>
                  <h3>Inventory</h3>

                  <p>Enter stock for each color and size.</p>
                </div>

                <strong>Total Stock: {totalStock}</strong>
              </div>

              <div className={styles.inventoryTableWrapper}>
                <table className={styles.inventoryTable}>
                  <thead>
                    <tr>
                      <th>Color</th>

                      {sizes.map((size) => (
                        <th key={size}>{size}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {colors.map((color) => (
                      <tr key={color}>
                        <td>
                          <strong>{color}</strong>
                        </td>

                        {sizes.map((size) => {
                          const row = getInventoryRow(color, size);

                          return (
                            <td key={size}>
                              <input
                                type="number"
                                min="0"
                                value={row?.stock ?? "0"}
                                onChange={(event) =>
                                  handleStockChange(
                                    color,
                                    size,
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* =================================================
            COLOR IMAGES
        ================================================= */}

        {colors.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Product Images</h2>

                <p>Upload images separately for each color.</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={handleImageSelect}
              className={styles.imageFileInput}
            />

            <div className={styles.colorImageSections}>
              {colors.map((color) => {
                const images = colorImages[color] || [];

                const names = colorImageNames[color] || [];

                return (
                  <div key={color} className={styles.colorImageSection}>
                    <div className={styles.colorImageHeader}>
                      <div>
                        <h3>{color}</h3>

                        <p>
                          {images.length > 0
                            ? `${images.length} ${
                                images.length === 1 ? "image" : "images"
                              }`
                            : "No images uploaded"}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={styles.chooseImageButton}
                        onClick={() => handleChooseImages(color)}
                      >
                        + Add Images
                      </button>
                    </div>

                    {images.length > 0 && (
                      <div className={styles.imageGrid}>
                        {images.map((image, index) => (
                          <div
                            className={`${styles.imageCard} ${
                              index === 0 ? styles.primaryImageCard : ""
                            }`}
                            key={`${image}-${index}`}
                          >
                            <div className={styles.imageWrapper}>
                              <img
                                src={image}
                                alt={
                                  names[index] || `${color} image ${index + 1}`
                                }
                              />

                              {index === 0 && (
                                <span className={styles.primaryBadge}>
                                  Primary
                                </span>
                              )}

                              <button
                                type="button"
                                className={styles.removeImageButton}
                                onClick={() =>
                                  handleRemoveColorImage(color, index)
                                }
                                aria-label={`Remove ${names[index] || "image"}`}
                              >
                                ×
                              </button>
                            </div>

                            <div className={styles.imageInfo}>
                              <span
                                className={styles.imageName}
                                title={names[index]}
                              >
                                {names[index] || `Image ${index + 1}`}
                              </span>

                              {index !== 0 && (
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={() =>
                                    handleSetPrimaryImage(color, index)
                                  }
                                >
                                  Set as primary
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <small className={styles.imageHelp}>
                      The first image will be used as the primary image for{" "}
                      {color}.
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>!</span>

            <span>{error}</span>
          </div>
        )}

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
            {createProductMutation.isPending ? (
              <>
                <span className={styles.spinner} />
                Creating...
              </>
            ) : (
              "Create Product"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
