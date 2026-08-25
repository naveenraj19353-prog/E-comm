import { useState } from "react";
import { useParams } from "react-router-dom";
import ProductDetailsView from "./ProductDetailsView";
import styles from "./ProductDetails.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useProductDetails } from "../../features/products/hooks/useProductDetails";
import { useReviews } from "../../features/reviews/hooks/useReviews";
import AuthModal from "../../components/Auth/AuthModal/AuthModal";
const ProductDetails = () => {
  const { tenantSlug, productId } = useParams<{
    tenantSlug: string;
    productId: string;
  }>();
  const { user, isAuthenticated } = useAuth();
  const { tenantId } = useStorefrontTenant();
  /*
   * PRODUCT
   */
  const {
    data: productResponse,
    isLoading: productLoading,
    isError: productIsError,
  } = useProductDetails(productId || "", tenantId);
  const product = productResponse?.data || null;
  /*
   * REVIEWS
   */
  const {
    reviews,
    isLoading: reviewsLoading,
    addReview,
    isCreating: isSubmittingReview,
  } = useReviews(productId || "", tenantId);
  /*
   * UI
   */
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  /*
   * USER
   */
  const cartUserId = user?._id || "";
  /*
   * CART
   */
  const { addToCart, isAdding } = useCart(cartUserId, tenantId);
  /*
   * WISHLIST
   */
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
    cartUserId,
    tenantId,
  );
  /*
   * WISHLIST STATUS
   */
  const isWishlisted = product
    ? wishlist.some((item) => item.productId === product._id)
    : false;
  /*
   * ADD TO CART
   *
   * Variant information is now included.
   *//*
 * ADD TO CART
 */
const handleAddToCart = async (
  selectedProductId: string,
  quantity: number,
  variantId?: string,
) => {
  /*
   * Customer must be logged in
   */
  if (!isAuthenticated || !user) {
    setShowAuthModal(true);
    return;
  }
  /*
   * Variant is required
   */
  if (!variantId) {
    alert("Please select an available color and size.");
    return;
  }
  try {
    await addToCart({
      tenantId,
      userId: user._id,
      productId: selectedProductId,
      quantity,
      variantId,
    });
  } catch (error) {
    console.error("Add to cart failed:", error);
  }
};
/*
 * WISHLIST
 */
const handleWishlist = async (selectedProductId: string) => {
  /*
   * Customer must be logged in
   */
  if (!isAuthenticated || !user) {
    setShowAuthModal(true);
    return;
  }
  try {
    if (isWishlisted) {
      await removeFromWishlist(selectedProductId);
    } else {
      await addToWishlist({
        tenantId,
        userId: user._id,
        productId: selectedProductId,
      });
    }
  } catch (error) {
    console.error("Wishlist update failed:", error);
  }
};
  /*
   * WRITE REVIEW
   */
  const handleWriteReview = () => {
    if (!isAuthenticated || !user) {
      setShowAuthModal(true);
      return;
    }
    setShowReviewForm(true);
  };
  /*
   * AUTH SUCCESS
   */
  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    setShowReviewForm(true);
  };
  /*
   * SUBMIT REVIEW
   */
  const handleSubmitReview = async () => {
    if (!product) {
      return;
    }
    if (!isAuthenticated || !user) {
      setShowAuthModal(true);
      return;
    }
    if (reviewRating === 0) {
      alert("Please select a rating.");
      return;
    }
    if (!reviewTitle.trim()) {
      alert("Please enter a review title.");
      return;
    }
    if (!reviewComment.trim()) {
      alert("Please enter your review.");
      return;
    }
    try {
      await addReview({
        tenantId: product.tenantId || tenantId,
        productId: product._id,
        userId: user._id,
        userName: user.name,
        rating: reviewRating,
        title: reviewTitle.trim(),
        comment: reviewComment.trim(),
        images: [],
      });
      setReviewRating(0);
      setReviewTitle("");
      setReviewComment("");
      setShowReviewForm(false);
      alert("Review submitted successfully!");
    } catch (error) {
      console.error("Review submission failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Unable to submit review.",
      );
    }
  };
  /*
   * LOADING
   */
  if (productLoading) {
    return (
      <div className={styles.state}>
        <div className={styles.loader} />
        <p>Loading product...</p>
      </div>
    );
  }
  /*
   * ERROR
   */
  if (productIsError || !product) {
    return (
      <div className={styles.state}>
        <h2>Product Not Found</h2>
        <p>Unable to load this product.</p>
      </div>
    );
  }
  return (
    <>
      <ProductDetailsView
        product={product}
        reviews={reviews}
        isWishlisted={isWishlisted}
        isAddingToCart={isAdding}
        onAddToCart={handleAddToCart}
        onWishlist={handleWishlist}
        onWriteReview={handleWriteReview}
        showReviewForm={showReviewForm}
        reviewRating={reviewRating}
        reviewTitle={reviewTitle}
        reviewComment={reviewComment}
        onReviewRatingChange={setReviewRating}
        onReviewTitleChange={setReviewTitle}
        onReviewCommentChange={setReviewComment}
        onSubmitReview={handleSubmitReview}
        isSubmittingReview={isSubmittingReview}
        reviewsLoading={reviewsLoading}
      />
      {showAuthModal && (
        <AuthModal
          tenantId={tenantId}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </>
  );
};
export default ProductDetails;
