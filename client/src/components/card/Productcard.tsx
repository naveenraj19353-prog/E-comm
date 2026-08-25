import React, { useMemo, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import styles from "./Productcard.module.css";
import { isProductOutOfStock } from "../../features/products/inventory";
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
export default function ProductCard({ product, isWishlisted = false, onWishlist, onAddToCart, isAdding = false, }: ProductCardProps) {
    const { _id, name, price, finalPrice, discountPercentage, images = {}, inventory = [], averageRating, reviewCount = 0, isActive = true, } = product;
    const availableInventory = useMemo(() => {
        return inventory.filter((item) => item.stock > 0 && item.color?.trim() && item.size?.trim());
    }, [inventory]);
    const availableColors = useMemo(() => {
        return [...new Set(availableInventory.map((item) => item.color))];
    }, [availableInventory]);
    const [selectedColorOverride, setSelectedColorOverride] = useState<string | null>(null);
    const selectedColor = useMemo(() => {
        if (selectedColorOverride &&
            availableColors.includes(selectedColorOverride)) {
            return selectedColorOverride;
        }
        return availableColors[0] ?? "";
    }, [selectedColorOverride, availableColors]);
    const availableSizes = useMemo(() => {
        if (!selectedColor) {
            return [];
        }
        return [
            ...new Set(availableInventory
                .filter((item) => item.color === selectedColor)
                .map((item) => item.size)),
        ];
    }, [availableInventory, selectedColor]);
    const [selectedSizeOverride, setSelectedSizeOverride] = useState<string | null>(null);
    const selectedSize = useMemo(() => {
        if (selectedSizeOverride && availableSizes.includes(selectedSizeOverride)) {
            return selectedSizeOverride;
        }
        return availableSizes[0] ?? "";
    }, [selectedSizeOverride, availableSizes]);
    const selectedVariant = useMemo(() => {
        if (!selectedColor || !selectedSize) {
            return undefined;
        }
        return availableInventory.find((item) => item.color === selectedColor && item.size === selectedSize);
    }, [availableInventory, selectedColor, selectedSize]);
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
    const handleColorChange = (event: React.MouseEvent<HTMLButtonElement>, color: string) => {
        event.stopPropagation();
        setSelectedColorOverride(color);
        setSelectedSizeOverride(null);
    };
    const handleSizeChange = (event: React.MouseEvent<HTMLButtonElement>, size: string) => {
        event.stopPropagation();
        setSelectedSizeOverride(size);
    };
    return (<article className={`${styles.card} ${!isActive ? styles.inactive : ""}`}>
      
      <div className={styles.imageContainer}>
        {validImages.length > 0 ? (<Swiper key={`${_id}-${selectedColor}`} modules={[Autoplay, Navigation, Pagination]} className={styles.productSwiper} slidesPerView={1} spaceBetween={0} loop={validImages.length > 1} speed={600} autoplay={validImages.length > 1
                ? {
                    delay: 3000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                }
                : false} navigation={validImages.length > 1
                ? {
                    prevEl: `.product-prev-${_id}`,
                    nextEl: `.product-next-${_id}`,
                }
                : false} pagination={validImages.length > 1
                ? {
                    clickable: true,
                }
                : false}>
            {validImages.map((image, index) => (<SwiperSlide key={`${_id}-${selectedColor}-${index}`} className={styles.productSlide}>
                <img src={image} alt={`${name} ${selectedColor} ${index + 1}`} className={styles.productImage} loading={index === 0 ? "eager" : "lazy"}/>
              </SwiperSlide>))}
          </Swiper>) : (<div className={styles.noImage}>
            <span>No Image</span>
          </div>)}
        <div className={styles.gradient}/>
        
        {discountPercentage > 0 && (<div className={styles.discount}>{discountPercentage}% OFF</div>)}
        
        <button type="button" className={`${styles.wishlist} ${isWishlisted ? styles.wishlistActive : ""}`} onClick={handleWishlist} aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}>
          <HeartIcon filled={isWishlisted}/>
        </button>
        
        {validImages.length > 1 && (<>
            <button type="button" className={`${styles.sliderArrow} ${styles.leftArrow} product-prev-${_id}`} onClick={(event) => event.stopPropagation()} aria-label="Previous image">
              <ArrowIcon direction="left"/>
            </button>
            <button type="button" className={`${styles.sliderArrow} ${styles.rightArrow} product-next-${_id}`} onClick={(event) => event.stopPropagation()} aria-label="Next image">
              <ArrowIcon direction="right"/>
            </button>
          </>)}
        
        {typeof averageRating === "number" && (<div className={styles.rating}>
            <span>{averageRating.toFixed(1)}</span>
            <StarIcon />
            <span className={styles.ratingSeparator}/>
            <span>{reviewCount}</span>
          </div>)}
        
        <div className={styles.cartContainer}>
          <button type="button" className={styles.cartButton} onClick={handleAddToCart} disabled={isAdding || isOutOfStock || !selectedVariant}>
            <BagIcon />
            <span>
              {isOutOfStock
            ? "Out of Stock"
            : isAdding
                ? "Adding..."
                : !selectedVariant
                    ? "Select Variant"
                    : "Add to Cart"}
            </span>
          </button>
        </div>
      </div>
      
      <div className={styles.info}>
        <h3 className={styles.name}>{name}</h3>
        
        {availableColors.length > 0 && (<div className={styles.colorSection}>
            <span className={styles.colorLabel}>Color:</span>
            <div className={styles.colorOptions}>
              {availableColors.map((color) => (<button key={color} type="button" className={`${styles.colorButton} ${selectedColor === color ? styles.colorButtonActive : ""}`} onClick={(event) => handleColorChange(event, color)} aria-label={`Select ${color}`} title={color}>
                  <span className={styles.colorDot} style={{
                    backgroundColor: getColorValue(color),
                }}/>
                  
                </button>))}
            </div>
          </div>)}
        
        {availableSizes.length > 0 && (<div className={styles.colorSection}>
            <span className={styles.colorLabel}>Size:</span>
            <div className={styles.colorOptions}>
              {availableSizes.map((size) => (<button key={size} type="button" className={`${styles.colorButton} ${selectedSize === size ? styles.colorButtonActive : ""}`} onClick={(event) => handleSizeChange(event, size)} aria-label={`Select size ${size}`}>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 600,
                }}>
                    {size}
                  </span>
                </button>))}
            </div>
          </div>)}
        
        {selectedVariant && (<div style={{
                fontSize: "11px",
                marginTop: "4px",
                opacity: 0.7,
            }}>
            {selectedVariant.color} / {selectedVariant.size}
          </div>)}
        
        <div className={styles.priceRow}>
          <span className={styles.finalPrice}>
            ₹{finalPrice?.toLocaleString("en-IN")}
          </span>
          {price > finalPrice && (<span className={styles.originalPrice}>
              ₹{price.toLocaleString("en-IN")}
            </span>)}
          {discountPercentage > 0 && (<span className={styles.discountPill}>
              {discountPercentage}% OFF
            </span>)}
        </div>
      </div>
    </article>);
}
function getColorValue(color: string): string {
    const normalized = color.toLowerCase().trim();
    const colors: Record<string, string> = {
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
    return colors[normalized] ?? "#d1d5db";
}
function HeartIcon({ filled }: {
    filled: boolean;
}) {
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function StarIcon() {
    return (<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17l-6.2 3.7 1.6-6.9-5.3-.7L12 2z"/>
    </svg>);
}
function BagIcon() {
    return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M6 8h12l1 12H5L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>);
}
function ArrowIcon({ direction }: {
    direction: "left" | "right";
}) {
    return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
