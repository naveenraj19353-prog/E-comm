import { useMemo, useState } from "react";
import type { Product } from "../../features/products/types";
import type { Review } from "../../features/reviews/types";
import ProductDelivery from "./ProductDelivery";
import ProductGallery from "./ProductGallery";
import ProductInfo from "./ProductInfo";
import ProductReviews from "./ProductReviews";
import ProductSpecifications from "./ProductSpecifications";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import styles from "./ProductDetails.module.css";

interface ProductDetailsViewProps {
    product: Product;
    reviews: Review[];
    isWishlisted: boolean;
    isAddingToCart: boolean;
    onAddToCart: (
        productId: string,
        quantity: number,
        variantId?: string,
    ) => void | Promise<void>;
    onWishlist: (productId: string) => void | Promise<void>;
    shareUrl: string;
    storeName?: string;
    isServiceMode?: boolean;
    isMenuMode?: boolean;
    onWriteReview: () => void;
    showReviewForm: boolean;
    reviewRating: number;
    reviewTitle: string;
    reviewComment: string;
    onReviewRatingChange: (rating: number) => void;
    onReviewTitleChange: (title: string) => void;
    onReviewCommentChange: (comment: string) => void;
    onSubmitReview: () => void;
    isSubmittingReview: boolean;
    reviewsLoading?: boolean;
}

const ProductDetailsView = ({
    product,
    reviews,
    isWishlisted,
    isAddingToCart,
    onAddToCart,
    onWishlist,
    shareUrl,
    storeName,
    isServiceMode = false,
    isMenuMode = false,
    onWriteReview,
    showReviewForm,
    reviewRating,
    reviewTitle,
    reviewComment,
    onReviewRatingChange,
    onReviewTitleChange,
    onReviewCommentChange,
    onSubmitReview,
    isSubmittingReview,
    reviewsLoading = false,
}: ProductDetailsViewProps) => {
    const usesSimpleVariant = isServiceMode;
    const firstAvailableColor = useMemo(() => {
        return product.inventory?.find((item) => item.stock > 0)?.color || "";
    }, [product.inventory]);
    const [selectedColor, setSelectedColor] = useState(firstAvailableColor);
    const availableSizes = useMemo(() => {
        if (usesSimpleVariant) {
            return [];
        }
        return (
            product.inventory
                ?.filter(
                    (item) =>
                        item.color === selectedColor && item.stock > 0,
                )
                .map((item) => item.size) || []
        );
    }, [product.inventory, selectedColor, usesSimpleVariant]);
    const firstAvailableSize = availableSizes[0] || "";
    const [selectedSize, setSelectedSize] = useState(firstAvailableSize);

    const selectedVariant = useMemo(() => {
        if (usesSimpleVariant) {
            return (
                product.inventory?.find((item) => item.stock > 0) ||
                product.inventory?.[0]
            );
        }
        return product.inventory?.find(
            (item) =>
                item.color === selectedColor &&
                item.size === selectedSize &&
                item.stock > 0,
        );
    }, [
        product.inventory,
        selectedColor,
        selectedSize,
        usesSimpleVariant,
    ]);

    const handleColorChange = (color: string) => {
        setSelectedColor(color);
        const firstSize =
            product.inventory?.find(
                (item) => item.color === color && item.stock > 0,
            )?.size || "";
        setSelectedSize(firstSize);
    };

    const layoutSettings = useLayoutSettings();
    const detailLayoutClass =
        layoutSettings.productDetailLayout === "gallery-right"
            ? styles.detailGalleryRight
            : layoutSettings.productDetailLayout === "stacked"
              ? styles.detailStacked
              : styles.detailGalleryLeft;

    const galleryColor = usesSimpleVariant
        ? product.inventory?.[0]?.color || selectedColor
        : selectedColor;

    return (
        <div className={styles.page}>
            <section
                className={`${styles.productSection} ${detailLayoutClass}`}
            >
                <ProductGallery product={product} selectedColor={galleryColor} />
                <div className={styles.infoColumn}>
                    <ProductInfo
                        product={product}
                        selectedColor={selectedColor}
                        selectedSize={selectedSize}
                        availableSizes={availableSizes}
                        selectedVariant={selectedVariant}
                        onColorChange={handleColorChange}
                        onSizeChange={setSelectedSize}
                        isWishlisted={isWishlisted}
                        isAddingToCart={isAddingToCart}
                        onAddToCart={onAddToCart}
                        onWishlist={onWishlist}
                        shareUrl={shareUrl}
                        storeName={storeName}
                        isServiceMode={isServiceMode}
                        isMenuMode={isMenuMode}
                    />
                    {!isServiceMode && !isMenuMode && <ProductDelivery />}
                </div>
            </section>
            {!isServiceMode && !isMenuMode && (
                <ProductSpecifications product={product} />
            )}
            {!isServiceMode && (
                <ProductReviews
                    reviews={reviews}
                    onWriteReview={onWriteReview}
                    showReviewForm={showReviewForm}
                    reviewRating={reviewRating}
                    reviewTitle={reviewTitle}
                    reviewComment={reviewComment}
                    onReviewRatingChange={onReviewRatingChange}
                    onReviewTitleChange={onReviewTitleChange}
                    onReviewCommentChange={onReviewCommentChange}
                    onSubmitReview={onSubmitReview}
                    isSubmittingReview={isSubmittingReview}
                    reviewsLoading={reviewsLoading}
                />
            )}
        </div>
    );
};

export default ProductDetailsView;
