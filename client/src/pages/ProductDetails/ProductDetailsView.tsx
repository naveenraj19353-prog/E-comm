import { useState } from "react";
import { Heart, Minus, Plus, ShoppingCart, Star, Truck } from "lucide-react";

import type { Product } from "../../features/products/types";

import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useReviews } from "../../features/reviews/hooks/useReviews";

import styles from "./ProductDetails.module.css";

interface ProductDetailsViewProps {
  product: Product;
}

const ProductDetailsView = ({ product }: ProductDetailsViewProps) => {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

  // ============================================================
  // CART
  // ============================================================

  const { addToCart, isAdding } = useCart(userId, tenantId);

  // ============================================================
  // WISHLIST
  // ============================================================

  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
    userId,
    tenantId
  );

  // ============================================================
  // REVIEWS
  // ============================================================

  const {
    reviews,
    reviewCount,
    isLoading: reviewsLoading,
  } = useReviews(product._id, tenantId);

  // ============================================================
  // LOCAL STATE
  // ============================================================

  const [selectedImage, setSelectedImage] = useState(0);

  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? "");

  const [selectedColor, setSelectedColor] = useState(product.colors[0] ?? "");

  const [quantity, setQuantity] = useState(1);

  const [isWishlistUpdating, setIsWishlistUpdating] = useState(false);

  const [zoom, setZoom] = useState({
    x: 50,
    y: 50,
    visible: false,
  });

  // ============================================================
  // WISHLIST STATE
  // ============================================================

  const isWishlisted = wishlist.some((item) => item.productId === product._id);

  // ============================================================
  // IMAGE
  // ============================================================

  const image = product.images[selectedImage];

  // ============================================================
  // QUANTITY
  // ============================================================

  const increaseQuantity = () => {
    setQuantity((current) => Math.min(current + 1, product.stock));
  };

  const decreaseQuantity = () => {
    setQuantity((current) => Math.max(current - 1, 1));
  };

  // ============================================================
  // ADD TO CART
  // ============================================================

  const handleAddToCart = async () => {
    try {
      await addToCart({
        tenantId,
        userId,
        productId: product._id,
        quantity,
      });
    } catch (error) {
      console.error("Add to cart failed:", error);
    }
  };

  // ============================================================
  // WISHLIST
  // ============================================================

  const handleWishlist = async () => {
    if (isWishlistUpdating) {
      return;
    }

    try {
      setIsWishlistUpdating(true);

      if (isWishlisted) {
        await removeFromWishlist(product._id);
      } else {
        await addToWishlist({
          tenantId,
          userId,
          productId: product._id,
        });
      }
    } catch (error) {
      console.error("Wishlist update failed:", error);
    } finally {
      setIsWishlistUpdating(false);
    }
  };

  // ============================================================
  // MAGNIFIER
  // ============================================================

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    const x = ((event.clientX - rect.left) / rect.width) * 100;

    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setZoom({
      x,
      y,
      visible: true,
    });
  };

  // ============================================================
  // RATING STARS
  // ============================================================

  const renderStars = (rating: number, size = 16) => {
    return [1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={size}
        fill={star <= Math.round(rating) ? "currentColor" : "none"}
      />
    ));
  };

  return (
    <div className={styles.container}>
      {/* ======================================================
          BREADCRUMB
      ====================================================== */}

      <div className={styles.breadcrumb}>
        Home
        <span>/</span>
        Products
        <span>/</span>
        {product.name}
      </div>

      {/* ======================================================
          PRODUCT
      ====================================================== */}

      <div className={styles.layout}>
        {/* ====================================================
            GALLERY
        ==================================================== */}

        <section className={styles.gallery}>
          {/* Thumbnails */}

          <div className={styles.thumbnails}>
            {product.images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={`${styles.thumbnail} ${
                  selectedImage === index ? styles.activeThumbnail : ""
                }`}
                onClick={() => setSelectedImage(index)}
              >
                <img src={image} alt={`${product.name} ${index + 1}`} />
              </button>
            ))}
          </div>

          {/* Main Image */}

          <div
            className={styles.imageArea}
            onMouseMove={handleMouseMove}
            onMouseLeave={() =>
              setZoom((current) => ({
                ...current,
                visible: false,
              }))
            }
          >
            <img src={image} alt={product.name} className={styles.mainImage} />

            {/* Discount */}

            {product.discountPercentage > 0 && (
              <span className={styles.badge}>
                -{product.discountPercentage}%
              </span>
            )}

            {/* Wishlist */}

            <button
              type="button"
              className={`${styles.wishlistButton} ${
                isWishlisted ? styles.wishlisted : ""
              }`}
              onClick={handleWishlist}
              disabled={isWishlistUpdating}
              aria-label={
                isWishlisted ? "Remove from wishlist" : "Add to wishlist"
              }
            >
              <Heart size={21} fill={isWishlisted ? "currentColor" : "none"} />
            </button>

            {/* Magnifier */}

            {zoom.visible && (
              <div
                className={styles.zoomLens}
                style={{
                  left: `${zoom.x}%`,
                  top: `${zoom.y}%`,
                }}
              />
            )}
          </div>

          {/* Zoom Preview */}

          {zoom.visible && (
            <div
              className={styles.zoomPreview}
              style={{
                backgroundImage: `url(${image})`,
                backgroundPosition: `${zoom.x}% ${zoom.y}%`,
              }}
            />
          )}
        </section>

        {/* ====================================================
            PRODUCT INFO
        ==================================================== */}

        <section className={styles.info}>
          {/* Rating */}

          <div className={styles.rating}>
            <span className={styles.stars}>
              <Star size={16} fill="currentColor" />

              {product.averageRating}
            </span>

            <span>{product.reviewCount} reviews</span>
          </div>

          {/* Name */}

          <h1>{product.name}</h1>

          {/* Description */}

          <p className={styles.description}>{product.description}</p>

          {/* Price */}

          <div className={styles.priceSection}>
            <span className={styles.currentPrice}>
              ₹{product.finalPrice.toLocaleString()}
            </span>

            {product.price > product.finalPrice && (
              <span className={styles.oldPrice}>
                ₹{product.price.toLocaleString()}
              </span>
            )}

            {product.discountPercentage > 0 && (
              <span className={styles.save}>
                Save {product.discountPercentage}%
              </span>
            )}
          </div>

          <div className={styles.divider} />

          {/* ==================================================
              COLOR
          ================================================== */}

          {product.colors.length > 0 && (
            <div className={styles.option}>
              <div className={styles.optionTitle}>
                Color
                <strong>{selectedColor}</strong>
              </div>

              <div className={styles.colorList}>
                {product.colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorButton} ${
                      selectedColor === color ? styles.selected : ""
                    }`}
                    onClick={() => setSelectedColor(color)}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ==================================================
              SIZE
          ================================================== */}

          {product.sizes.length > 0 && (
            <div className={styles.option}>
              <div className={styles.optionTitle}>
                Size
                <strong>{selectedSize}</strong>
              </div>

              <div className={styles.sizeList}>
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.sizeButton} ${
                      selectedSize === size ? styles.selected : ""
                    }`}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ==================================================
              STOCK
          ================================================== */}

          <div className={styles.stock}>
            <span
              className={product.stock > 0 ? styles.inStock : styles.outOfStock}
            >
              {product.stock > 0 ? "● In Stock" : "● Out of Stock"}
            </span>

            {product.stock > 0 && <span>{product.stock} available</span>}
          </div>

          {/* ==================================================
              ACTIONS
          ================================================== */}

          <div className={styles.actions}>
            {/* Quantity */}

            <div className={styles.quantity}>
              <button
                type="button"
                onClick={decreaseQuantity}
                disabled={quantity <= 1}
              >
                <Minus size={17} />
              </button>

              <span>{quantity}</span>

              <button
                type="button"
                onClick={increaseQuantity}
                disabled={quantity >= product.stock}
              >
                <Plus size={17} />
              </button>
            </div>

            {/* Cart */}

            <button
              type="button"
              className={styles.cartButton}
              onClick={handleAddToCart}
              disabled={product.stock === 0 || isAdding}
            >
              <ShoppingCart size={19} />

              {isAdding ? "Adding..." : "Add to Cart"}
            </button>
          </div>

          {/* Delivery */}

          <div className={styles.delivery}>
            <Truck size={20} />

            <div>
              <strong>Free delivery</strong>

              <span>Available on this product</span>
            </div>
          </div>
        </section>
      </div>

      {/* ======================================================
          REVIEWS
      ====================================================== */}

      <section className={styles.reviewsSection}>
        {/* Reviews Header */}

        <div className={styles.reviewsHeader}>
          <div>
            <span className={styles.reviewsEyebrow}>Customer Feedback</span>

            <h2>Customer Reviews</h2>

            <p>See what customers are saying about this product.</p>
          </div>

          {/* Rating Summary */}

          <div className={styles.reviewSummary}>
            <strong>{product.averageRating.toFixed(1)}</strong>

            <div className={styles.summaryStars}>
              {renderStars(product.averageRating, 18)}
            </div>

            <span>
              {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>
        </div>

        <div className={styles.reviewDivider} />

        {/* Reviews Loading */}

        {reviewsLoading ? (
          <div className={styles.reviewsLoading}>Loading reviews...</div>
        ) : reviews.length === 0 ? (
          /* Empty */

          <div className={styles.noReviews}>
            <Star size={30} />

            <h3>No reviews yet</h3>

            <p>Be the first customer to review this product.</p>
          </div>
        ) : (
          /* Review List */

          <div className={styles.reviewList}>
            {reviews.map((review) => (
              <article key={review._id} className={styles.reviewCard}>
                {/* Review Top */}

                <div className={styles.reviewTop}>
                  <div className={styles.reviewer}>
                    <div className={styles.avatar}>
                      {(review.userName ?? "Customer").charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <h3>{review.userName ?? "Customer"}</h3>

                      <span>
                        {new Date(review.createdAt).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Stars */}

                  <div className={styles.reviewStars}>
                    {renderStars(review.rating, 15)}
                  </div>
                </div>

                {/* Title */}

                <h4>{review.title}</h4>

                {/* Comment */}

                <p className={styles.reviewComment}>{review.comment}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ProductDetailsView;
