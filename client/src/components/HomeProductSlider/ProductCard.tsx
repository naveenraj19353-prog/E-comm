import React, { useMemo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import styles from "./ProductCard.module.css";
import { isProductOutOfStock } from "../../features/products/inventory";
import { useProductNavigation } from "../../features/products/hooks/useProductNavigation";
import { getColorValue } from "./ProductCard.utils";
import { ArrowIcon, BagIcon, HeartIcon, StarIcon } from "./ProductCardIcons";
import { useProductVariantSelection } from "./useProductVariantSelection";

export interface ProductInventory {
    variantId: string;
    color: string;
    size: string;
    stock: number;
}

export interface Product {
    _id: string;
    name: string;
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
    onWishlist?: (productId: string, isAdding: boolean) => void;
    onAddToCart?: (productId: string, variantId: string, color: string, size: string) => void;
    isAdding?: boolean;
}

export default function ProductCard({
    product,
    isWishlisted = false,
    onWishlist,
    onAddToCart,
    isAdding = false,
}: ProductCardProps) {
    const { goToProduct } = useProductNavigation();
    const {
        _id,
        name,
        price,
        finalPrice,
        discountPercentage,
        images = {},
        inventory = [],
        averageRating,
        reviewCount = 0,
        isActive = true,
    } = product;

    const {
        availableColors,
        availableSizes,
        selectedColor,
        selectedSize,
        selectedVariant,
        selectColor,
        selectSize,
    } = useProductVariantSelection(inventory);

    const isOutOfStock = isProductOutOfStock(product);
    const validImages = useMemo(() => {
        if (!selectedColor) {
            return [];
        }
        const colorImages = images[selectedColor];
        if (!Array.isArray(colorImages)) {
            return [];
        }
        return colorImages.filter((image): image is string => typeof image === "string" && image.trim().length > 0);
    }, [images, selectedColor]);

    const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!onWishlist) {
            return;
        }
        onWishlist(_id, !isWishlisted);
    };

    const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isAdding) {
            return;
        }
        if (!selectedVariant) {
            console.log("No available variant selected");
            return;
        }
        console.log("Adding selected variant:", selectedVariant);
        onAddToCart?.(_id, selectedVariant.variantId, selectedVariant.color, selectedVariant.size);
    };

    const handleCardClick = () => {
        goToProduct(_id);
    };

    const stopPropagation = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    const cartButtonLabel = isOutOfStock
        ? "Out of Stock"
        : isAdding
            ? "Adding..."
            : !selectedVariant
                ? "Select Variant"
                : "Add to Cart";

    return (
        <article
            className={`${styles.card} ${!isActive ? styles.inactive : ""}`}
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
            <div className={styles.imageContainer}>
                {validImages.length > 0 ? (
                    <Swiper
                        key={`${_id}-${selectedColor}`}
                        modules={[Autoplay, Navigation, Pagination]}
                        className={styles.productSwiper}
                        slidesPerView={1}
                        spaceBetween={0}
                        loop={validImages.length > 1}
                        speed={600}
                        autoplay={validImages.length > 1 ? {
                            delay: 3000,
                            disableOnInteraction: false,
                            pauseOnMouseEnter: true,
                        } : false}
                        navigation={validImages.length > 1 ? {
                            prevEl: `.product-prev-${_id}`,
                            nextEl: `.product-next-${_id}`,
                        } : false}
                        pagination={validImages.length > 1 ? { clickable: true } : false}
                    >
                        {validImages.map((image, index) => (
                            <SwiperSlide key={`${_id}-${selectedColor}-${index}`} className={styles.productSlide}>
                                <img
                                    src={image}
                                    alt={`${name} ${selectedColor} ${index + 1}`}
                                    className={styles.productImage}
                                    loading={index === 0 ? "eager" : "lazy"}
                                />
                            </SwiperSlide>
                        ))}
                    </Swiper>
                ) : (
                    <div className={styles.noImage}>
                        <span>No Image</span>
                    </div>
                )}
                <div className={styles.gradient} />
                {discountPercentage > 0 && (
                    <div className={styles.discount}>{discountPercentage}% OFF</div>
                )}
                <button
                    type="button"
                    className={`${styles.wishlist} ${isWishlisted ? styles.wishlistActive : ""}`}
                    onClick={handleWishlist}
                    aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon filled={isWishlisted} />
                </button>
                {validImages.length > 1 && (
                    <>
                        <button
                            type="button"
                            className={`${styles.sliderArrow} ${styles.leftArrow} product-prev-${_id}`}
                            onClick={stopPropagation}
                            aria-label="Previous image"
                        >
                            <ArrowIcon direction="left" />
                        </button>
                        <button
                            type="button"
                            className={`${styles.sliderArrow} ${styles.rightArrow} product-next-${_id}`}
                            onClick={stopPropagation}
                            aria-label="Next image"
                        >
                            <ArrowIcon direction="right" />
                        </button>
                    </>
                )}
                {typeof averageRating === "number" && (
                    <div className={styles.rating}>
                        <span>{averageRating.toFixed(1)}</span>
                        <StarIcon />
                        <span className={styles.ratingSeparator} />
                        <span>{reviewCount}</span>
                    </div>
                )}
                <div className={styles.cartContainer}>
                    <button
                        type="button"
                        className={styles.cartButton}
                        onClick={handleAddToCart}
                        disabled={isAdding || isOutOfStock || !selectedVariant}
                    >
                        <BagIcon />
                        <span>{cartButtonLabel}</span>
                    </button>
                </div>
            </div>
            <div className={styles.info}>
                <h3 className={styles.name}>{name}</h3>
                {availableColors.length > 0 && (
                    <div className={styles.colorSection}>
                        <span className={styles.optionLabel}>Color:</span>
                        <div className={styles.colorOptions}>
                            {availableColors.map((color) => (
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
                    </div>
                )}
                {availableSizes.length > 0 && (
                    <div className={styles.sizeSection}>
                        <span className={styles.optionLabel}>Size:</span>
                        <div className={styles.sizeOptions}>
                            {availableSizes.map((size) => (
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
                    </div>
                )}
                <div className={styles.priceRow}>
                    <span className={styles.finalPrice}>
                        ₹{finalPrice?.toLocaleString("en-IN")}
                    </span>
                    {price > finalPrice && (
                        <span className={styles.originalPrice}>
                            ₹{price.toLocaleString("en-IN")}
                        </span>
                    )}
                    {discountPercentage > 0 && (
                        <span className={styles.discountPill}>
                            {discountPercentage}% OFF
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
}
