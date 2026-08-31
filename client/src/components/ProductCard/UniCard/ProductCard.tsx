import { useMemo, useState } from "react";
import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import { isProductOutOfStock, getFirstProductImage, } from "../../../features/products/inventory";
import ProductImage from "../../ProductImage";
import { useProductNavigation } from "../../../features/products/hooks/useProductNavigation";
import { useLayoutSettings } from "../../../theme/useThemeSettings";
import type { Product, ProductInventory, } from "../../../features/products/types";
interface ProductCardProps {
    product: Product;
    isWishlisted?: boolean;
    onWishlist?: (productId: string) => void;
    onAddToCart?: (productId: string, variantId: string, color: string, size: string) => void;
    isAdding?: boolean;
}
const ProductCard = ({ product, isWishlisted = false, onWishlist, onAddToCart, isAdding = false, }: ProductCardProps) => {
    const layoutSettings = useLayoutSettings();
    const { goToProduct } = useProductNavigation();
    const availableInventory = useMemo<ProductInventory[]>(() => {
        return (product.inventory ?? []).filter((item) => item.stock > 0 &&
            item.color?.trim() &&
            item.size?.trim());
    }, [product.inventory]);
    const availableColors = useMemo(() => {
        return [
            ...new Set(availableInventory.map((item) => item.color)),
        ];
    }, [availableInventory]);
    const [selectedColor, setSelectedColor] = useState<string>("");
    const [selectedSize, setSelectedSize] = useState<string>("");
    const activeColor = selectedColor &&
        availableColors.includes(selectedColor)
        ? selectedColor
        : availableColors[0] ?? "";
    const availableSizes = useMemo(() => {
        if (!activeColor) {
            return [];
        }
        return [
            ...new Set(availableInventory
                .filter((item) => item.color === activeColor &&
                item.stock > 0)
                .map((item) => item.size)),
        ];
    }, [availableInventory, activeColor]);
    const activeSize = selectedSize &&
        availableSizes.includes(selectedSize)
        ? selectedSize
        : availableSizes[0] ?? "";
    const selectedVariant = useMemo(() => {
        if (!activeColor || !activeSize) {
            return undefined;
        }
        return availableInventory.find((item) => item.color === activeColor &&
            item.size === activeSize &&
            item.stock > 0);
    }, [
        availableInventory,
        activeColor,
        activeSize,
    ]);
    const isOutOfStock = isProductOutOfStock(product);
    const productImage = useMemo(() => {
        if (activeColor) {
            const colorImages = product.images?.[activeColor];
            if (Array.isArray(colorImages) && colorImages.length > 0) {
                return colorImages[0];
            }
        }
        return getFirstProductImage(product.images);
    }, [product.images, activeColor]);
    const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onWishlist?.(product._id);
    };
    const handleColorChange = (event: React.MouseEvent<HTMLButtonElement>, color: string) => {
        event.stopPropagation();
        setSelectedColor(color);
        setSelectedSize("");
    };
    const handleSizeChange = (event: React.MouseEvent<HTMLButtonElement>, size: string) => {
        event.stopPropagation();
        setSelectedSize(size);
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
        console.log("Adding variant:", {
            productId: product._id,
            variantId: selectedVariant.variantId,
            color: selectedVariant.color,
            size: selectedVariant.size,
            stock: selectedVariant.stock,
        });
        onAddToCart?.(product._id, selectedVariant.variantId, selectedVariant.color, selectedVariant.size);
    };
    const hasRating = typeof product.averageRating === "number" &&
        product.averageRating > 0;
    const handleCardClick = () => {
        goToProduct(product._id);
    };
    return (<div className={`${styles.card} ${!product.isActive ? styles.inactive : ""}`} onClick={handleCardClick} role="link" tabIndex={0} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleCardClick();
            }
        }}>
      
      {layoutSettings.showDiscountBadge && product.discountPercentage > 0 && (<span className={styles.discount}>
          -{product.discountPercentage}%
        </span>)}
      
      <button type="button" className={`${styles.wishlist} ${layoutSettings.wishlistIconPosition === "left" ? styles.wishlistLeft : styles.wishlistRight} ${isWishlisted ? styles.wishlisted : ""}`} onClick={handleWishlist} aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}>
        <Heart size={18} fill={isWishlisted ? "currentColor" : "none"}/>
      </button>
      
      <div className={styles.imageWrapper}>
        <ProductImage
            src={productImage}
            alt={`${product.name}${activeColor ? ` ${activeColor}` : ""}`}
            className={styles.image}
            loading="lazy"
            placeholder={<div className={styles.noImage}>No Image</div>}
        />
        {isOutOfStock && (<div className={styles.outOfStock}>Out of Stock</div>)}
      </div>
      
      <div className={styles.content}>
        
        <h3>{product.name}</h3>
        
        {layoutSettings.showProductRating && hasRating && (<div className={styles.rating}>
            <Star size={14} fill="#fbbf24" stroke="#fbbf24"/>
            <span>
              {product.averageRating.toFixed(1)}
              {" "}
              ({product.reviewCount})
            </span>
          </div>)}
        
        {availableColors.length > 0 && (<div className={styles.variantSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantLabel}>
                Color
              </span>
              <span className={styles.selectedValue}>
                {activeColor}
              </span>
            </div>
            <div className={styles.colorOptions}>
              {availableColors.map((color) => (<button key={color} type="button" className={`${styles.colorOption} ${activeColor === color
                    ? styles.colorOptionActive
                    : ""}`} onClick={(event) => handleColorChange(event, color)} title={color} aria-label={`Select ${color}`}>
                    <span className={styles.colorDot} style={{
                    backgroundColor: getColorValue(color),
                }}/>
                  </button>))}
            </div>
          </div>)}
        
        {availableSizes.length > 0 && (<div className={styles.variantSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantLabel}>
                Size
              </span>
              <span className={styles.selectedValue}>
                {activeSize}
              </span>
            </div>
            <div className={styles.sizeOptions}>
              {availableSizes.map((size) => (<button key={size} type="button" className={`${styles.sizeOption} ${activeSize === size
                    ? styles.sizeOptionActive
                    : ""}`} onClick={(event) => handleSizeChange(event, size)}>
                    {size}
                  </button>))}
            </div>
          </div>)}
        
        <div className={styles.price}>
          <span className={styles.current}>
            ₹{" "}
            {product.finalPrice.toLocaleString("en-IN")}
          </span>
          {product.price >
            product.finalPrice && (<span className={styles.old}>
              ₹{" "}
              {product.price.toLocaleString("en-IN")}
            </span>)}
        </div>
        
        {layoutSettings.showQuickAddOnCard && (<button type="button" className={styles.cartBtn} onClick={handleAddToCart} disabled={isOutOfStock || !selectedVariant || isAdding}>
          <ShoppingCart size={18}/>
          {isOutOfStock
            ? "Out Of Stock"
            : isAdding
                ? "Adding..."
                : !selectedVariant
                    ? "Select Variant"
                    : "Add To Cart"}
        </button>)}
      </div>
    </div>);
};
export default ProductCard;
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
    return (colors[normalized] ??
        "#d1d5db");
}
