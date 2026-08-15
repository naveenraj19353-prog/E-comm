import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ProductDetailsView from "./ProductDetailsView";
import type { Product } from "../../features/products/types";
import type { Review } from "../../features/reviews/types";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import styles from "./ProductDetails.module.css";
import AuthModal from "../../components/Auth/AuthModal/AuthModal";
import { useAuth } from "../../features/auth/hooks/useAuth";

const ProductDetails = () => {
  const { productId } = useParams<{
    productId: string;
  }>();

  const { user, isAuthenticated } = useAuth();
  console.log(
    "ProductDetails - user:",
    user,
    "isAuthenticated:",
    isAuthenticated,
  );

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  
  const cartUserId = user?._id;
  const { addToCart, isAdding } = useCart(cartUserId, user?.tenantId);
 
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
    cartUserId,
    user?.tenantId,
  );
 
  const fetchReviews = async () => {
    if (!productId) {
      return;
    }
    try {
      setReviewsLoading(true);
      const response = await fetch(
        `http://127.0.0.1:8000/reviews/product/${productId}?tenantId=${user?.tenantId}`,
      );
      if (!response.ok) {
        throw new Error("Unable to fetch reviews");
      }
      const result = await response.json();
      if (result.success) {
        setReviews(result.data || []);
      }
    } catch (error) {
      console.error("Reviews fetch failed:", error);
    } finally {
      setReviewsLoading(false);
    }
  };
  useEffect(() => {
    if (!productId) {
      return;
    }
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(
          `http://127.0.0.1:8000/product/${productId}?tenantId=${user?.tenantId}`,
        );
        if (!response.ok) {
          throw new Error("Unable to fetch product");
        }
        const result = await response.json();
        if (!result.success || !result.data) {
          throw new Error("Product not found");
        }
        setProduct(result.data);
      } catch (error) {
        console.error("Product fetch failed:", error);
        setError("Unable to load this product.");
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  const isWishlisted = product
    ? wishlist.some((item) => item.productId === product._id)
    : false;

  const handleAddToCart = async (productId: string, quantity: number) => {
    try {
      await addToCart({
        tenantId: user?.tenantId,
        userId: cartUserId,
        productId,
        quantity,
      });
    } catch (error) {
      console.error("Add to cart failed:", error);
    }
  };

  const handleWishlist = async (productId: string) => {
    try {
      if (isWishlisted) {
        await removeFromWishlist(productId);
      } else {
        await addToWishlist({
          tenantId: user?.tenantId,
          userId: cartUserId,
          productId,
        });
      }
    } catch (error) {
      console.error("Wishlist update failed:", error);
    }
  };

  const handleWriteReview = () => {
    if (!isAuthenticated || !user) {
      setShowAuthModal(true);
      return;
    }
    setShowReviewForm(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    setShowReviewForm(true);
  };

  
  const handleSubmitReview = async () => {
    if (!product) {
      return;
    }
  
    
    if (!user) {
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
      setIsSubmittingReview(true);
      const response = await fetch("http://127.0.0.1:8000/reviews/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: product?.tenantId,
          productId: product._id,
          userId: user?._id,
          userName: user.name,
          rating: reviewRating,
          title: reviewTitle.trim(),
          comment: reviewComment.trim(),
          images: [],
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.detail || "Unable to submit review");
      }
      // Refresh reviews
      await fetchReviews();
      // Reset form
      setReviewRating(0);
      setReviewTitle("");
      setReviewComment("");
      setShowReviewForm(false);
      alert("Review submitted successfully!");
    } catch (error) {
      console.error("Review submission failed:", error);
      alert(
        error instanceof Error ? error.message : "Unable to submit review.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [productId]);
  if (loading) {
    return (
      <div className={styles.state}>
        <div className={styles.loader} />
        <p>Loading product...</p>
      </div>
    );
  }
 
  if (!product || error) {
    return (
      <div className={styles.state}>
        <h2>Product Not Found</h2>
        <p>{error || "Unable to find this product."}</p>
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
          tenantId={user?.tenantId}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </>
  );
};
export default ProductDetails;
