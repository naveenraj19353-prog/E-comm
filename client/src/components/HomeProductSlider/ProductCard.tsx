import React, { useMemo } from "react";
import styles from "./ProductCard.module.css";
import { isProductOutOfStock, getProductImagesForColor } from "../../features/products/inventory";
import ProductCardMedia from "../ProductImage/ProductCardMedia";
import { useProductNavigation } from "../../features/products/hooks/useProductNavigation";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import {
    addToListLabel,
    isServiceBusiness,
} from "../../features/tenant/businessMode";
import { getColorValue } from "./ProductCard.utils";
import { HeartIcon, StarIcon, BagIcon } from "./ProductCardIcons";
import { useProductVariantSelection } from "./useProductVariantSelection";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import { BusyLabel, Spinner } from "../Loading";

export interface ProductInventory {
    variantId: string;
    color: string;
    size: string;
    stock: number;
}

export interface Product {
    _id: string;
    name: string;
    description?: string;
    brand?: string;
    categoryName?: string;
    price: number;
    finalPrice: number;
    discountPercentage: number;
    images?: Record<string, string[]>;
    inventory?: ProductInventory[];
    averageRating?: number;
    reviewCount?: number;
    isActive?: boolean;
}

interface ProductCardProps {
    product: Product;
    isWishlisted?: boolean;
    /** True while this card's wishlist toggle is in flight. */
    isWishlistPending?: boolean;
    onWishlist?: (productId: string, isAdding: boolean) => void;
    onAddToCart?: (productId: string, variantId: string, color: string, size: string) => void;
    isAdding?: boolean;
    mediaVariant?: "hover" | "swiper";
}

export default function ProductCard({
    product,
    isWishlisted = false,
    isWishlistPending = false,
    onWishlist,
    onAddToCart,
    isAdding = false,
    mediaVariant = "swiper",
}: ProductCardProps) {
    const layoutSettings = useLayoutSettings();
    const design =
        layoutSettings.productCardDesign === "studio" ||
        layoutSettings.productCardDesign === "minimal"
            ? layoutSettings.productCardDesign
            : "classic";
    const { goToProduct } = useProductNavigation();
    const { tenant } = useStorefrontTenant();
    const { formatPrice } = useFormatStorePrice();
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const {
        _id,
        name,
        description = "",
        brand = "",
        categoryName = "",
        price,
        finalPrice,
        discountPercentage,
        images = {},
        inventory = [],
        averageRating = 0,
        reviewCount = 0,
        isActive = true,
    } = product;

    const {
        availableColors,
        availableSizes,
        selectedColor,
        selectedSize,
        selectedVariant: retailVariant,
        selectColor,
        selectSize,
    } = useProductVariantSelection(inventory);

    const selectedVariant = isServiceMode
        ? inventory.find((item) => item.stock > 0) || inventory[0]
        : retailVariant;

    const isOutOfStock = isProductOutOfStock(product);
    const validImages = useMemo(
        () =>
            getProductImagesForColor(
                images,
                isServiceMode
                    ? inventory[0]?.color || selectedColor
                    : selectedColor,
            ),
        [images, selectedColor, isServiceMode, inventory],
    );

    const summary = description.replace(/\s+/g, " ").trim().slice(0, 72);
    const hasRating = !isServiceMode && averageRating > 0 && reviewCount > 0;
    const filledStars = Math.max(0, Math.min(5, Math.round(averageRating)));
    const displayColors = availableColors.filter(
        (color) => color && color !== "Default",
    );
    const displaySizes = availableSizes.filter(
        (size) =>
            size &&
            size !== "Not Specified" &&
            size !== "One Size" &&
            size !== "Standard",
    );
    const specs = [
        brand ? { label: "Brand", value: brand } : null,
        categoryName ? { label: "Category", value: categoryName } : null,
        !isServiceMode && selectedColor && selectedColor !== "Default"
            ? { label: "Color", value: selectedColor }
            : null,
        !isServiceMode && selectedSize && displaySizes.includes(selectedSize)
            ? { label: "Size", value: selectedSize }
            : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onWishlist?.(_id, !isWishlisted);
    };

    const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isAdding || isOutOfStock) {
            return;
        }
        onAddToCart?.(
            _id,
            selectedVariant?.variantId || "",
            selectedVariant?.color || "",
            selectedVariant?.size || "",
        );
    };

    const handleCardClick = () => {
        goToProduct(_id);
    };

    const stopPropagation = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    const cartButtonLabel = isOutOfStock
        ? isServiceMode
            ? "Unavailable"
            : "Out of Stock"
        : isAdding
            ? "Adding..."
            : !selectedVariant
                ? isServiceMode
                    ? "Unavailable"
                    : "Select Variant"
                : addToListLabel(isServiceMode);

    const showRating = layoutSettings.showProductRating && hasRating;
    const showDiscount = layoutSettings.showDiscountBadge && !isServiceMode && discountPercentage > 0;
    const showCart = layoutSettings.showQuickAddOnCard;
    const heartLeft = layoutSettings.wishlistIconPosition === "left";

    const media = (
        <div className={styles.imageContainer}>
            {design === "studio" && <div className={styles.glow} aria-hidden />}
            {validImages.length > 0 ? (
                <ProductCardMedia
                    sources={validImages}
                    alt={`${name} ${selectedColor}`.trim()}
                    mediaClassName={styles.productImage}
                    loading="lazy"
                    variant={mediaVariant}
                />
            ) : (
                <div className={styles.noImage}>
                    <span>No Image</span>
                </div>
            )}
            {isOutOfStock && (
                <div className={styles.outOfStock}>
                    {isServiceMode ? "Unavailable" : "Out of Stock"}
                </div>
            )}
            {showDiscount && <div className={styles.discount}>{discountPercentage}% OFF</div>}
            <button
                type="button"
                className={`${styles.wishlist} ${heartLeft ? styles.wishlistLeft : styles.wishlistRight} ${isWishlisted ? styles.wishlistActive : ""}`}
                onClick={handleWishlist}
                disabled={isWishlistPending}
                aria-busy={isWishlistPending}
                aria-label={
                    isWishlistPending
                        ? "Updating wishlist"
                        : isWishlisted
                          ? "Remove from wishlist"
                          : "Add to wishlist"
                }
            >
                {isWishlistPending ? (
                    <Spinner size="sm" />
                ) : (
                    <HeartIcon filled={isWishlisted} />
                )}
            </button>
            {design === "studio" && (
                <div className={styles.priceBadge}>
                    {formatPrice(finalPrice)}
                </div>
            )}
            {design === "classic" && showRating && (
                <div className={styles.rating}>
                    <span>{averageRating.toFixed(1)}</span>
                    <StarIcon />
                    <span className={styles.ratingSeparator} />
                    <span>{reviewCount}</span>
                </div>
            )}
            {design === "classic" && showCart && (
                <div className={styles.cartContainer}>
                    <button
                        type="button"
                        className={styles.cartButton}
                        onClick={handleAddToCart}
                        disabled={isAdding || isOutOfStock}
                        aria-busy={isAdding}
                    >
                        {isAdding ? <Spinner size="sm" /> : <BagIcon />}
                        <span>{cartButtonLabel}</span>
                    </button>
                </div>
            )}
        </div>
    );

    const colorPickers = displayColors.length > 1 && (
        <div className={styles.colorOptions}>
            {displayColors.map((color) => (
                <button
                    key={color}
                    type="button"
                    className={`${styles.colorButton} ${selectedColor === color ? styles.colorButtonActive : ""}`}
                    onClick={(event) => {
                        stopPropagation(event);
                        selectColor(color);
                    }}
                    aria-label={`Select ${color}`}
                    title={color}
                >
                    <span
                        className={styles.colorDot}
                        style={{ backgroundColor: getColorValue(color) }}
                    />
                </button>
            ))}
        </div>
    );

    const sizePickers = displaySizes.length > 0 && (
        <div className={styles.sizeOptions}>
            {displaySizes.map((size) => (
                <button
                    key={size}
                    type="button"
                    className={`${styles.sizeButton} ${selectedSize === size ? styles.sizeButtonActive : ""}`}
                    onClick={(event) => {
                        stopPropagation(event);
                        selectSize(size);
                    }}
                    aria-label={`Select size ${size}`}
                >
                    {size}
                </button>
            ))}
        </div>
    );

    return (
        <article
            className={`${styles.card} ${styles[design]} ${!isActive ? styles.inactive : ""} ${isOutOfStock ? styles.soldOut : ""}`}
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
            {media}
            {design === "studio" ? (
                <div className={styles.info}>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoMain}>
                            <h3 className={styles.name}>{name}</h3>
                            {summary ? <p className={styles.summary}>{summary}</p> : null}
                            {showRating ? (
                                <div className={styles.stars} aria-label={`${averageRating.toFixed(1)} out of 5`}>
                                    {Array.from({ length: 5 }, (_, index) => (
                                        <span
                                            key={index}
                                            className={index < filledStars ? styles.starOn : styles.starOff}
                                        >
                                            <StarIcon />
                                        </span>
                                    ))}
                                </div>
                            ) : isServiceMode ? (
                                <p className={styles.availability}>
                                    {isOutOfStock ? "Unavailable" : "Available"}
                                </p>
                            ) : null}
                            {colorPickers}
                            {sizePickers}
                        </div>
                        {specs.length > 0 && (
                            <div className={styles.infoMeta}>
                                {specs.slice(0, 3).map((spec) => (
                                    <div key={spec.label} className={styles.spec}>
                                        <span>{spec.label}</span>
                                        <strong>{spec.value}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {showCart && (
                        <button
                            type="button"
                            className={styles.cartButton}
                            onClick={handleAddToCart}
                            disabled={isAdding || isOutOfStock}
                            aria-busy={isAdding}
                        >
                            <BusyLabel busy={isAdding}>{cartButtonLabel}</BusyLabel>
                        </button>
                    )}
                </div>
            ) : (
                <div className={styles.info}>
                    <h3 className={styles.name}>{name}</h3>
                    {design === "minimal" && showRating && (
                        <div className={styles.stars} aria-label={`${averageRating.toFixed(1)} out of 5`}>
                            {Array.from({ length: 5 }, (_, index) => (
                                <span
                                    key={index}
                                    className={index < filledStars ? styles.starOn : styles.starOff}
                                >
                                    <StarIcon />
                                </span>
                            ))}
                        </div>
                    )}
                    {colorPickers}
                    {sizePickers}
                    <div className={styles.priceRow}>
                        <span className={styles.finalPrice}>
                            {formatPrice(finalPrice)}
                        </span>
                        {!isServiceMode && price > finalPrice && (
                            <span className={styles.originalPrice}>
                                {formatPrice(price)}
                            </span>
                        )}
                    </div>
                    {design === "minimal" && showCart && (
                        <button
                            type="button"
                            className={styles.cartButton}
                            onClick={handleAddToCart}
                            disabled={isAdding || isOutOfStock}
                            aria-busy={isAdding}
                        >
                            <BusyLabel busy={isAdding}>{cartButtonLabel}</BusyLabel>
                        </button>
                    )}
                </div>
            )}
        </article>
    );
}
