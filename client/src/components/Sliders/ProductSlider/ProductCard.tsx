import { Heart, ShoppingCart, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import type { Product } from "../../../features/products/types";
import {
    getProductImagesForColor,
    isProductOutOfStock,
} from "../../../features/products/inventory";
import ProductCardMedia from "../../ProductImage/ProductCardMedia";
import { useProductNavigation } from "../../../features/products/hooks/useProductNavigation";
import { useStorefrontTenant } from "../../../features/tenant/useTenant";
import {
    addToListLabel,
    isServiceBusiness,
} from "../../../features/tenant/businessMode";

interface ProductCardProps {
    product: Product;
    isWishlisted?: boolean;
    onWishlist?: (id: string) => void;
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
    const { goToProduct } = useProductNavigation();
    const { tenant } = useStorefrontTenant();
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const outOfStock = isProductOutOfStock(product);
    const images = getProductImagesForColor(product.images);
    const handleWishlist = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onWishlist?.(product._id);
    };
    const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isAdding || outOfStock) {
            return;
        }
        const variant = (product.inventory || []).find(
            (item) => Number(item.stock) > 0 && item.variantId,
        ) || (product.inventory || [])[0];
        // Always notify parent so guests can open the login modal first.
        onAddToCart?.(
            product._id,
            variant?.variantId || "",
            variant?.color || "",
            variant?.size || "",
        );
    };
    const handleCardClick = () => {
        goToProduct(product._id);
    };
    return (
        <div
            className={`${styles.card} ${outOfStock ? styles.soldOut : ""}`}
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
            {!isServiceMode && product.discountPercentage > 0 && (
                <span className={styles.discount}>
                    -{product.discountPercentage}%
                </span>
            )}
            <button
                type="button"
                className={`${styles.wishlist} ${isWishlisted ? styles.wishlisted : ""}`}
                onClick={handleWishlist}
                aria-label={
                    isWishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
            >
                <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
            </button>
            <div className={styles.imageWrapper}>
                <ProductCardMedia
                    sources={images}
                    alt={product.name}
                    mediaClassName={styles.image}
                    variant="swiper"
                />
                {outOfStock && (
                    <div className={styles.outOfStock}>
                        {isServiceMode ? "Unavailable" : "Out of Stock"}
                    </div>
                )}
            </div>
            <div className={styles.content}>
                <h3>{product.name}</h3>
                {!isServiceMode ? (
                    <div className={styles.rating}>
                        <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
                        <span>
                            {product.averageRating} ({product.reviewCount})
                        </span>
                    </div>
                ) : (
                    <div className={styles.rating}>
                        <span>{outOfStock ? "Unavailable" : "Available"}</span>
                    </div>
                )}
                <div className={styles.price}>
                    <span className={styles.current}>
                        ₹{product.finalPrice.toLocaleString()}
                    </span>
                    {!isServiceMode && product.price > product.finalPrice && (
                        <span className={styles.old}>
                            ₹{product.price.toLocaleString()}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    className={styles.cartBtn}
                    onClick={handleAddToCart}
                    disabled={isAdding || outOfStock}
                >
                    <ShoppingCart size={18} />
                    {outOfStock
                        ? isServiceMode
                            ? "Unavailable"
                            : "Out Of Stock"
                        : isAdding
                          ? "Adding..."
                          : addToListLabel(isServiceMode)}
                </button>
            </div>
        </div>
    );
};
export default ProductCard;
