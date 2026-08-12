import type { Product } from "../../features/products/types";
import type { Review } from "../../features/reviews/types";
import DeliverySection from "./DeliverySection";
import ProductDelivery from "./ProductDelivery";



import styles from "./ProductDetails.module.css";
import ProductGallery from "./ProductGallery";
import ProductInfo from "./ProductInfo";
import ProductReviews from "./ProductReviews";
import ProductSpecifications from "./ProductSpecifications";

interface ProductDetailsViewProps {
  product: Product;

  reviews: Review[];

  isWishlisted: boolean;
  isAddingToCart: boolean;

  onAddToCart: (
    productId: string,
    quantity: number
  ) => void | Promise<void>;

  onWishlist: (productId: string) => void | Promise<void>;

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
  return (
    <div className={styles.page}>
      <section className={styles.productSection}>
        <ProductGallery product={product} />

        <ProductInfo
          product={product}
          isWishlisted={isWishlisted}
          isAddingToCart={isAddingToCart}
          onAddToCart={onAddToCart}
          onWishlist={onWishlist}
        />
      </section>

      <ProductDelivery />

      <ProductSpecifications product={product} />

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
    </div>
  );
};

export default ProductDetailsView;