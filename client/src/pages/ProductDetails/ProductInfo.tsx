import { useEffect, useMemo, useState } from "react";
import { Heart, ShoppingBag, Star, Minus, Plus, } from "lucide-react";
import styles from "./ProductDetails.module.css";
import type { Product, ProductInventory, } from "../../features/products/types";
import { getColorValue } from "../../utils/productColors";
interface ProductInfoProps {
    product: Product;
    selectedColor: string;
    selectedSize: string;
    availableSizes: string[];
    selectedVariant?: ProductInventory;
    onColorChange: (color: string) => void;
    onSizeChange: (size: string) => void;
    isWishlisted: boolean;
    isAddingToCart: boolean;
    onAddToCart: (productId: string, quantity: number, variantId?: string) => void | Promise<void>;
    onWishlist: (productId: string) => void | Promise<void>;
}
const ProductInfo = ({ product, selectedColor, selectedSize, availableSizes, selectedVariant, onColorChange, onSizeChange, isWishlisted, isAddingToCart, onAddToCart, onWishlist, }: ProductInfoProps) => {
    const [quantity, setQuantity] = useState(1);
    const availableColors = useMemo(() => {
        const colors = new Set<string>();
        product.inventory?.forEach((item) => {
            if (item.stock > 0) {
                colors.add(item.color);
            }
        });
        return Array.from(colors);
    }, [product.inventory]);
    useEffect(() => {
        setQuantity(1);
    }, [selectedColor, selectedSize]);
    const currentStock = selectedVariant?.stock || 0;
    const increaseQuantity = () => {
        setQuantity((value) => Math.min(value + 1, currentStock));
    };
    const decreaseQuantity = () => {
        setQuantity((value) => Math.max(1, value - 1));
    };
    const handleColorChange = (color: string) => {
        onColorChange(color);
    };
    return (<div className={styles.info}>
      
      <div className={styles.category}>
        {product.categoryName ||
            product.categoryId}
      </div>
      
      <h1 className={styles.title}>
        {product.name}
      </h1>
      
      <div className={styles.ratingRow}>
        <div className={styles.stars}>
          {Array.from({ length: 5 }, (_, index) => (<Star key={index} size={17} fill={index <
                Math.round(product.averageRating)
                ? "currentColor"
                : "none"}/>))}
        </div>
        <strong className={styles.ratingValue}>
          {product.averageRating.toFixed(1)}
        </strong>
        <span className={styles.reviewCount}>
          ({product.reviewCount} reviews)
        </span>
      </div>
      
      <div className={styles.priceSection}>
        <span className={styles.currentPrice}>
          ₹
          {product.finalPrice.toLocaleString("en-IN")}
        </span>
        {product.discountPercentage > 0 && (<>
            <span className={styles.originalPrice}>
              ₹
              {product.price.toLocaleString("en-IN")}
            </span>
            <span className={styles.discount}>
              {product.discountPercentage}% OFF
            </span>
          </>)}
      </div>
      
      <p className={styles.description}>
        {product.description}
      </p>
      <div className={styles.divider}/>
      
      {availableColors.length > 0 && (<div className={styles.optionGroup}>
          <div className={styles.optionHeading}>
            <span>Color</span>
            <strong>
              {selectedColor}
            </strong>
          </div>
          <div className={styles.colorOptions}>
            {availableColors.map((color) => (<button key={color} type="button" className={`${styles.colorOption} ${selectedColor === color
                    ? styles.optionSelected
                    : ""}`} onClick={() => handleColorChange(color)}>
                <span className={styles.colorDot} style={{
                    backgroundColor: getColorValue(color),
                }}/>
                {color}
              </button>))}
          </div>
        </div>)}
      
      {availableSizes.length > 0 && (<div className={styles.optionGroup}>
          <div className={styles.optionHeading}>
            <span>Size</span>
            <button type="button" className={styles.sizeGuide}>
              Size Guide
            </button>
          </div>
          <div className={styles.sizeOptions}>
            {availableSizes.map((size) => (<button key={size} type="button" className={`${styles.sizeOption} ${selectedSize === size
                    ? styles.optionSelected
                    : ""}`} onClick={() => onSizeChange(size)}>
                {size}
              </button>))}
          </div>
        </div>)}
      
      <div className={currentStock > 0
            ? styles.stockAvailable
            : styles.stockUnavailable}>
        <span />
        {currentStock > 0
            ? `${currentStock} items available`
            : "Out of stock"}
      </div>
      
      <div className={styles.actionRow}>
        <div className={styles.quantityControl}>
          <button type="button" disabled={quantity <= 1} onClick={decreaseQuantity}>
            <Minus size={15}/>
          </button>
          <span>{quantity}</span>
          <button type="button" disabled={quantity >= currentStock} onClick={increaseQuantity}>
            <Plus size={15}/>
          </button>
        </div>
        <button type="button" className={styles.addToCart} disabled={currentStock <= 0 ||
            !selectedVariant ||
            isAddingToCart} onClick={() => onAddToCart(product._id, quantity, selectedVariant?.variantId)}>
          <ShoppingBag size={18}/>
          {isAddingToCart
            ? "Adding..."
            : "Add to Cart"}
        </button>
        <button type="button" className={`${styles.wishlistButton} ${isWishlisted
            ? styles.wishlistActive
            : ""}`} onClick={() => onWishlist(product._id)} aria-label={isWishlisted
            ? "Remove from wishlist"
            : "Add to wishlist"}>
          <Heart size={20} fill={isWishlisted
            ? "currentColor"
            : "none"}/>
        </button>
      </div>
    </div>);
};
export default ProductInfo;
