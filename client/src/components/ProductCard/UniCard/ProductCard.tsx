import { useMemo, useState } from "react";
import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import type {
  Product,
  ProductInventory,
} from "../../../features/products/types";
interface ProductCardProps {
  product: Product;
  isWishlisted?: boolean;
  onWishlist?: (productId: string) => void;
  onAddToCart?: (
    productId: string,
    variantId: string,
    color: string,
    size: string,
  ) => void;
  isAdding?: boolean;
}
const ProductCard = ({
  product,
  isWishlisted = false,
  onWishlist,
  onAddToCart,
  isAdding = false,
}: ProductCardProps) => {
  // =========================================================
  // AVAILABLE INVENTORY
  // =========================================================
  const availableInventory = useMemo<ProductInventory[]>(() => {
    return (product.inventory ?? []).filter(
      (item) =>
        item.stock > 0 &&
        item.color?.trim() &&
        item.size?.trim(),
    );
  }, [product.inventory]);
  // =========================================================
  // AVAILABLE COLORS
  // =========================================================
  const availableColors = useMemo(() => {
    return [
      ...new Set(
        availableInventory.map(
          (item) => item.color,
        ),
      ),
    ];
  }, [availableInventory]);
  // =========================================================
  // SELECTED COLOR
  // =========================================================
  const [selectedColor, setSelectedColor] =
    useState<string>("");
  // =========================================================
  // SELECTED SIZE
  // =========================================================
  const [selectedSize, setSelectedSize] =
    useState<string>("");
  // =========================================================
  // CURRENT COLOR
  // =========================================================
  const activeColor =
    selectedColor &&
    availableColors.includes(selectedColor)
      ? selectedColor
      : availableColors[0] ?? "";
  // =========================================================
  // AVAILABLE SIZES FOR CURRENT COLOR
  // =========================================================
  const availableSizes = useMemo(() => {
    if (!activeColor) {
      return [];
    }
    return [
      ...new Set(
        availableInventory
          .filter(
            (item) =>
              item.color === activeColor &&
              item.stock > 0,
          )
          .map((item) => item.size),
      ),
    ];
  }, [availableInventory, activeColor]);
  // =========================================================
  // CURRENT SIZE
  // =========================================================
  const activeSize =
    selectedSize &&
    availableSizes.includes(selectedSize)
      ? selectedSize
      : availableSizes[0] ?? "";
  // =========================================================
  // SELECTED VARIANT
  // =========================================================
  const selectedVariant = useMemo(() => {
    if (!activeColor || !activeSize) {
      return undefined;
    }
    return availableInventory.find(
      (item) =>
        item.color === activeColor &&
        item.size === activeSize &&
        item.stock > 0,
    );
  }, [
    availableInventory,
    activeColor,
    activeSize,
  ]);
  // =========================================================
  // TOTAL STOCK
  // =========================================================
  const totalStock = useMemo(() => {
    return (product.inventory ?? []).reduce(
      (total, item) =>
        total + Math.max(item.stock, 0),
      0,
    );
  }, [product.inventory]);
  // =========================================================
  // IMAGE
  // =========================================================
  const productImage = useMemo(() => {
    if (!activeColor) {
      return Object.values(
        product.images ?? {},
      )
        .flat()
        .find(
          (image) =>
            typeof image === "string" &&
            image.trim().length > 0,
        );
    }
    const colorImages =
      product.images?.[activeColor];
    if (
      Array.isArray(colorImages) &&
      colorImages.length > 0
    ) {
      return colorImages[0];
    }
    return Object.values(
      product.images ?? {},
    )
      .flat()
      .find(
        (image) =>
          typeof image === "string" &&
          image.trim().length > 0,
      );
  }, [product.images, activeColor]);
  // =========================================================
  // WISHLIST
  // =========================================================
  const handleWishlist = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    onWishlist?.(product._id);
  };
  // =========================================================
  // COLOR CHANGE
  // =========================================================
  const handleColorChange = (
    event: React.MouseEvent<HTMLButtonElement>,
    color: string,
  ) => {
    event.stopPropagation();
    setSelectedColor(color);
    /*
     * Reset size.
     *
     * activeSize will automatically choose
     * the first available size for the new color.
     */
    setSelectedSize("");
  };
  // =========================================================
  // SIZE CHANGE
  // =========================================================
  const handleSizeChange = (
    event: React.MouseEvent<HTMLButtonElement>,
    size: string,
  ) => {
    event.stopPropagation();
    setSelectedSize(size);
  };
  // =========================================================
  // ADD TO CART
  // =========================================================
  const handleAddToCart = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (isAdding) {
      return;
    }
    if (!selectedVariant) {
      console.log(
        "No available variant selected",
      );
      return;
    }
    console.log("Adding variant:", {
      productId: product._id,
      variantId: selectedVariant.variantId,
      color: selectedVariant.color,
      size: selectedVariant.size,
      stock: selectedVariant.stock,
    });
    onAddToCart?.(
      product._id,
      selectedVariant.variantId,
      selectedVariant.color,
      selectedVariant.size,
    );
  };
  // =========================================================
  // OUT OF STOCK
  // =========================================================
  const isOutOfStock =
    !product.isActive ||
    totalStock <= 0;
  // =========================================================
  // RATING
  // =========================================================
  const hasRating =
    typeof product.averageRating === "number" &&
    product.averageRating > 0;
  return (
    <div
      className={`${styles.card} ${
        !product.isActive
          ? styles.inactive
          : ""
      }`}
    >
      {/* =====================================================
          DISCOUNT
      ====================================================== */}
      {product.discountPercentage > 0 && (
        <span className={styles.discount}>
          -{product.discountPercentage}%
        </span>
      )}
      {/* =====================================================
          WISHLIST
      ====================================================== */}
      <button
        type="button"
        className={`${styles.wishlist} ${
          isWishlisted
            ? styles.wishlisted
            : ""
        }`}
        onClick={handleWishlist}
        aria-label={
          isWishlisted
            ? "Remove from wishlist"
            : "Add to wishlist"
        }
      >
        <Heart
          size={18}
          fill={
            isWishlisted
              ? "currentColor"
              : "none"
          }
        />
      </button>
      {/* =====================================================
          IMAGE
      ====================================================== */}
      <div className={styles.imageWrapper}>
        {productImage ? (
          <img
            src={productImage}
            alt={`${product.name}${
              activeColor
                ? ` ${activeColor}`
                : ""
            }`}
            className={styles.image}
            loading="lazy"
          />
        ) : (
          <div className={styles.noImage}>
            No Image
          </div>
        )}
      </div>
      {/* =====================================================
          CONTENT
      ====================================================== */}
      <div className={styles.content}>
        {/* PRODUCT NAME */}
        <h3>{product.name}</h3>
        {/* ===================================================
            RATING
        ==================================================== */}
        {hasRating && (
          <div className={styles.rating}>
            <Star
              size={14}
              fill="#fbbf24"
              stroke="#fbbf24"
            />
            <span>
              {product.averageRating.toFixed(1)}
              {" "}
              ({product.reviewCount})
            </span>
          </div>
        )}
        {/* ===================================================
            COLOR
        ==================================================== */}
        {availableColors.length > 0 && (
          <div className={styles.variantSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantLabel}>
                Color
              </span>
              <span className={styles.selectedValue}>
                {activeColor}
              </span>
            </div>
            <div className={styles.colorOptions}>
              {availableColors.map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorOption} ${
                      activeColor === color
                        ? styles.colorOptionActive
                        : ""
                    }`}
                    onClick={(event) =>
                      handleColorChange(
                        event,
                        color,
                      )
                    }
                    title={color}
                    aria-label={`Select ${color}`}
                  >
                    <span
                      className={
                        styles.colorDot
                      }
                      style={{
                        backgroundColor:
                          getColorValue(
                            color,
                          ),
                      }}
                    />
                  </button>
                ),
              )}
            </div>
          </div>
        )}
        {/* ===================================================
            SIZE
        ==================================================== */}
        {availableSizes.length > 0 && (
          <div className={styles.variantSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantLabel}>
                Size
              </span>
              <span className={styles.selectedValue}>
                {activeSize}
              </span>
            </div>
            <div className={styles.sizeOptions}>
              {availableSizes.map(
                (size) => (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.sizeOption} ${
                      activeSize === size
                        ? styles.sizeOptionActive
                        : ""
                    }`}
                    onClick={(event) =>
                      handleSizeChange(
                        event,
                        size,
                      )
                    }
                  >
                    {size}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
        {/* ===================================================
            PRICE
        ==================================================== */}
        <div className={styles.price}>
          <span className={styles.current}>
            ₹{" "}
            {product.finalPrice.toLocaleString(
              "en-IN",
            )}
          </span>
          {product.price >
            product.finalPrice && (
            <span className={styles.old}>
              ₹{" "}
              {product.price.toLocaleString(
                "en-IN",
              )}
            </span>
          )}
        </div>
        {/* ===================================================
            ADD TO CART
        ==================================================== */}
        <button
          type="button"
          className={styles.cartBtn}
          onClick={handleAddToCart}
          disabled={
            isOutOfStock ||
            !selectedVariant ||
            isAdding
          }
        >
          <ShoppingCart size={18} />
          {isOutOfStock
            ? "Out Of Stock"
            : isAdding
              ? "Adding..."
              : !selectedVariant
                ? "Select Variant"
                : "Add To Cart"}
        </button>
      </div>
    </div>
  );
};
export default ProductCard;
/* =========================================================
   COLOR
========================================================= */
function getColorValue(
  color: string,
): string {
  const normalized =
    color.toLowerCase().trim();
  const colors: Record<
    string,
    string
  > = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    black: "#111827",
    white: "#ffffff",
    grey: "#9ca3af",
    gray: "#9ca3af",
    beige: "#d6c2a1",
    pink: "#ec4899",
    purple: "#a855f7",
    orange: "#f97316",
    brown: "#92400e",
    navy: "#1e3a8a",
  };
  return (
    colors[normalized] ??
    "#d1d5db"
  );
}
