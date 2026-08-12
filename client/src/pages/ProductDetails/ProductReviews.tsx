import {
    Send,
    Star,
    UserRound,
  } from "lucide-react";
  
  import type { Review } from "../../features/reviews/types";
  
  import styles from "./ProductDetails.module.css";
  
  interface ProductReviewsProps {
    reviews: Review[];
  
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
  
  const ProductReviews = ({
    reviews,
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
  }: ProductReviewsProps) => {
    return (
      <section className={styles.reviewsSection}>
        {/* =====================================================
            HEADER
        ===================================================== */}
  
        <div className={styles.reviewsHeader}>
          <div>
            <span className={styles.sectionEyebrow}>
              CUSTOMER FEEDBACK
            </span>
  
            <h2>Customer Reviews</h2>
          </div>
  
          <button
            type="button"
            className={styles.writeReviewButton}
            onClick={onWriteReview}
          >
            <Send size={15} />
            Write a Review
          </button>
        </div>
  
        {/* =====================================================
            REVIEW FORM
        ===================================================== */}
  
        {showReviewForm && (
          <div className={styles.reviewForm}>
            <div className={styles.reviewFormHeader}>
              <h3>Write your review</h3>
  
              <p>
                Share your experience with this product.
              </p>
            </div>
  
            {/* Rating */}
  
            <div className={styles.reviewField}>
              <label>Your Rating</label>
  
              <div className={styles.reviewStars}>
                {Array.from({ length: 5 }, (_, index) => {
                  const rating = index + 1;
  
                  return (
                    <button
                      key={rating}
                      type="button"
                      className={styles.reviewStarButton}
                      onClick={() =>
                        onReviewRatingChange(rating)
                      }
                      aria-label={`Rate ${rating} out of 5`}
                    >
                      <Star
                        size={24}
                        fill={
                          rating <= reviewRating
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  );
                })}
              </div>
            </div>
  
            {/* Review Title */}
  
            <div className={styles.reviewField}>
              <label htmlFor="review-title">
                Review Title
              </label>
  
              <input
                id="review-title"
                type="text"
                value={reviewTitle}
                onChange={(event) =>
                  onReviewTitleChange(event.target.value)
                }
                placeholder="Summarize your experience"
              />
            </div>
  
            {/* Review Comment */}
  
            <div className={styles.reviewField}>
              <label htmlFor="review-comment">
                Your Review
              </label>
  
              <textarea
                id="review-comment"
                rows={5}
                value={reviewComment}
                onChange={(event) =>
                  onReviewCommentChange(event.target.value)
                }
                placeholder="What did you like about this product?"
              />
            </div>
  
            {/* Submit */}
  
            <button
              type="button"
              className={styles.submitReview}
              disabled={isSubmittingReview}
              onClick={onSubmitReview}
            >
              {isSubmittingReview
                ? "Submitting..."
                : "Submit Review"}
            </button>
          </div>
        )}
  
        {/* =====================================================
            REVIEWS LIST
        ===================================================== */}
  
        {reviewsLoading ? (
          <div className={styles.noReviews}>
            Loading reviews...
          </div>
        ) : reviews.length === 0 ? (
          <div className={styles.noReviews}>
            <Star size={28} />
  
            <h3>No reviews yet</h3>
  
            <p>
              Be the first to review this product.
            </p>
          </div>
        ) : (
          <div className={styles.reviewList}>
            {reviews.map((review) => (
              <article
                key={review._id}
                className={styles.reviewCard}
              >
                {/* Avatar */}
  
                <div className={styles.reviewerAvatar}>
                  <UserRound size={18} />
                </div>
  
                {/* Content */}
  
                <div className={styles.reviewContent}>
                  <div className={styles.reviewTop}>
                    <div>
                      {/* Stars */}
  
                      <div className={styles.reviewStars}>
                        {Array.from(
                          { length: 5 },
                          (_, index) => (
                            <Star
                              key={index}
                              size={14}
                              fill={
                                index < review.rating
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          )
                        )}
                      </div>
  
                      {/* Title */}
  
                      <h3>{review.title}</h3>
                    </div>
  
                    {/* Date */}
  
                    <span className={styles.reviewDate}>
                      {new Date(
                        review.createdAt
                      ).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
  
                  {/* Comment */}
  
                  <p>{review.comment}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  };
  
  export default ProductReviews;