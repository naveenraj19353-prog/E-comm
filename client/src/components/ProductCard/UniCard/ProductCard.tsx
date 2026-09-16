import { useMemo, useState } from "react";
import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import { isProductOutOfStock, getProductImagesForColor } from "../../../features/products/inventory";
import ProductImage from "../../ProductImage";
import { useProductNavigation } from "../../../features/products/hooks/useProductNavigation";
import { useLayoutSettings } from "../../../theme/useThemeSettings";
import { useStorefrontTenant } from "../../../features/tenant/useTenant";
import {
    addToListLabel,
    isMenuBusiness,
    isServiceBusiness,
} from "../../../features/tenant/businessMode";
import type { Product, ProductInventory } from "../../../features/products/types";
import { getColorValue } from "../../../utils/productColors";

interface ProductCardProps {
    product: Product;
    isWishlisted?: boolean;
    onWishlist?: (productId: string) => void;
    onAddToCart?: (productId: string, variantId: string, color: string, size: string) => void;
    isAdding?: boolean;
}

const ProductCard = ({
    product,
    isWishlisted = false,
    onWishlist,
    onAddToCart,
    isAdding = false,
}: ProductCardProps) => {
    const layoutSettings = useLayoutSettings();
    const { tenant } = useStorefrontTenant();
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const isMenuMode = isMenuBusiness(tenant?.businessType);
    const { goToProduct } = useProductNavigation();
    const availableInventory = useMemo<ProductInventory[]>(() => {
        return (product.inventory ?? []).filter(
            (item) => item.stock > 0 && item.color?.trim() && item.size?.trim(),
        );
    }, [product.inventory]);
    const availableColors = useMemo(() => {
        if (isServiceMode) return [];
        return [...new Set(availableInventory.map((item) => item.color))];
    }, [availableInventory, isServiceMode]);
    const [selectedColor, setSelectedColor] = useState<string>("");
    const [selectedSize, setSelectedSize] = useState<string>("");
    const activeColor =
        selectedColor && availableColors.includes(selectedColor)
            ? selectedColor
            : availableColors[0] ?? "";
    const availableSizes = useMemo(() => {
        if (isServiceMode || !activeColor) return [];
        return [
            ...new Set(
                availableInventory
                    .filter((item) => item.color === activeColor && item.stock > 0)
                    .map((item) => item.size),
            ),
        ];
    }, [availableInventory, activeColor, isServiceMode]);
    const activeSize =
        selectedSize && availableSizes.includes(selectedSize)
            ? selectedSize
            : availableSizes[0] ?? "";
    const selectedVariant = useMemo(() => {
        if (isServiceMode) {
            return (
                availableInventory[0] ||
                (product.inventory ?? []).find((item) => item.stock > 0)
            );
        }
        if (!activeColor || !activeSize) return undefined;
        return availableInventory.find(
            (item) =>
                item.color === activeColor &&
                item.size === activeSize &&
                item.stock > 0,
        );
    }, [availableInventory, activeColor, activeSize, isServiceMode, product.inventory]);
    const isOutOfStock = isProductOutOfStock(product);
    const productImage = useMemo(() => {
        const colorKey = isServiceMode
            ? product.inventory?.[0]?.color || ""
            : activeColor;
        const colorImages = getProductImagesForColor(product.images, colorKey);
        return colorImages[0] || "";
    }, [product.images, product.inventory, activeColor, isServiceMode]);

    const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onWishlist?.(product._id);
    };
    const handleColorChange = (
        event: React.MouseEvent<HTMLButtonElement>,
        color: string,
    ) => {
        event.stopPropagation();
        setSelectedColor(color);
        setSelectedSize("");
    };
    const handleSizeChange = (
        event: React.MouseEvent<HTMLButtonElement>,
        size: string,
    ) => {
        event.stopPropagation();
        setSelectedSize(size);
    };
    const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isAdding) return;
        // Always notify parent so guests can open the login modal first.
        onAddToCart?.(
            product._id,
            selectedVariant?.variantId || "",
            selectedVariant?.color || "",
            selectedVariant?.size || "",
        );
    };
    const hasRating =
        typeof product.averageRating === "number" && product.averageRating > 0;
    const handleCardClick = () => {
        goToProduct(product._id);
    };
    const cartLabel = isOutOfStock
        ? isServiceMode
            ? "Unavailable"
            : "Out Of Stock"
        : isAdding
          ? "Adding..."
          : !selectedVariant
            ? isServiceMode
                ? "Unavailable"
                : "Select Variant"
            : addToListLabel(isServiceMode, { isMenu: isMenuMode });

    return (
        <div
            className={`${styles.card} ${!product.isActive ? styles.inactive : ""}`}
            onClick={handleCardClick}
            role="link"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleCardClick();
                }
            }}
        >
            {!isServiceMode &&
                layoutSettings.showDiscountBadge &&
                product.discountPercentage > 0 && (
                    <span className={styles.discount}>
                        -{product.discountPercentage}%
                    </span>
                )}

            <button
                type="button"
                className={`${styles.wishlist} ${
                    layoutSettings.wishlistIconPosition === "left"
                        ? styles.wishlistLeft
                        : styles.wishlistRight
                } ${isWishlisted ? styles.wishlisted : ""}`}
                onClick={handleWishlist}
                aria-label={
                    isWishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
            >
                <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
            </button>

            <div className={styles.imageWrapper}>
                <ProductImage
                    src={productImage}
                    alt={`${product.name}${activeColor ? ` ${activeColor}` : ""}`}
                    className={styles.image}
                    loading="lazy"
                    placeholder={<div className={styles.noImage}>No Image</div>}
                />
                {isOutOfStock && (
                    <div className={styles.outOfStock}>
                        {isServiceMode ? "Unavailable" : "Out of Stock"}
                    </div>
                )}
            </div>

            <div className={styles.content}>
                <h3>{product.name}</h3>

                {!isServiceMode &&
                    layoutSettings.showProductRating &&
                    hasRating && (
                        <div className={styles.rating}>
                            <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
                            <span>
                                {product.averageRating.toFixed(1)} ({product.reviewCount})
                            </span>
                        </div>
                    )}

                {!isServiceMode && availableColors.length > 0 && (
                    <div className={styles.variantSection}>
                        <div className={styles.variantHeader}>
                            <span className={styles.variantLabel}>Color</span>
                            <span className={styles.selectedValue}>{activeColor}</span>
                        </div>
                        <div className={styles.colorOptions}>
                            {availableColors.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    className={`${styles.colorOption} ${
                                        activeColor === color
                                            ? styles.colorOptionActive
                                            : ""
                                    }`}
                                    onClick={(event) => handleColorChange(event, color)}
                                    title={color}
                                    aria-label={`Select ${color}`}
                                >
                                    <span
                                        className={styles.colorDot}
                                        style={{ backgroundColor: getColorValue(color) }}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!isServiceMode && availableSizes.length > 0 && (
                    <div className={styles.variantSection}>
                        <div className={styles.variantHeader}>
                            <span className={styles.variantLabel}>Size</span>
                            <span className={styles.selectedValue}>{activeSize}</span>
                        </div>
                        <div className={styles.sizeOptions}>
                            {availableSizes.map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    className={`${styles.sizeOption} ${
                                        activeSize === size ? styles.sizeOptionActive : ""
                                    }`}
                                    onClick={(event) => handleSizeChange(event, size)}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isServiceMode && (
                    <div className={styles.rating}>
                        <span>{isOutOfStock ? "Unavailable" : "Available"}</span>
                    </div>
                )}

                <div className={styles.price}>
                    <span className={styles.current}>
                        ₹ {product.finalPrice.toLocaleString("en-IN")}
                    </span>
                    {!isServiceMode && product.price > product.finalPrice && (
                        <span className={styles.old}>
                            ₹ {product.price.toLocaleString("en-IN")}
                        </span>
                    )}
                </div>

                {layoutSettings.showQuickAddOnCard && (
                    <button
                        type="button"
                        className={styles.cartBtn}
                        onClick={handleAddToCart}
                        disabled={isAdding}
                    >
                        <ShoppingCart size={18} />
                        {cartLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ProductCard;
