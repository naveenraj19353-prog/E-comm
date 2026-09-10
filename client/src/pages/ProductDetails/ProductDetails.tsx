import { useState } from "react";
import { useParams } from "react-router-dom";
import PageLoader from "../../components/PageLoader";
import ProductDetailsView from "./ProductDetailsView";
import styles from "./ProductDetails.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useNavigateToLogin } from "../../features/auth/hooks/useNavigateToLogin";
import { useProductDetails } from "../../features/products/hooks/useProductDetails";
import { useReviews } from "../../features/reviews/hooks/useReviews";
import {
    SeoHead,
    buildCanonicalUrl,
    buildProductJsonLd,
} from "../../features/seo";
import {
    getFirstProductImage,
    isProductOutOfStock,
} from "../../features/products/inventory";
const ProductDetails = () => {
    const { productId } = useParams<{
        tenantSlug: string;
        productId: string;
    }>();
    const { user, isAuthenticated } = useAuth();
    const { tenantId, tenantSlug } = useStorefrontTenant();
    const navigateToLogin = useNavigateToLogin();
    const { data: productResponse, isLoading: productLoading, isError: productIsError, } = useProductDetails(productId || "", tenantId);
    const product = productResponse?.data || null;
    const { reviews, isLoading: reviewsLoading, addReview, isCreating: isSubmittingReview, } = useReviews(productId || "", tenantId);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewTitle, setReviewTitle] = useState("");
    const [reviewComment, setReviewComment] = useState("");
    const cartUserId = user?._id || "";
    const { addToCart, isAdding } = useCart(cartUserId, tenantId);
    const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(cartUserId, tenantId);
    const isWishlisted = product
        ? wishlist.some((item) => item.productId === product._id)
        : false;
    const requireLogin = () => {
        navigateToLogin();
    };
    const handleAddToCart = async (selectedProductId: string, quantity: number, variantId?: string) => {
        if (!isAuthenticated || !user) {
            requireLogin();
            return;
        }
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
        }
        catch (error) {
            console.error("Add to cart failed:", error);
        }
    };
    const handleWishlist = async (selectedProductId: string) => {
        if (!isAuthenticated || !user) {
            requireLogin();
            return;
        }
        try {
            if (isWishlisted) {
                await removeFromWishlist(selectedProductId);
            }
            else {
                await addToWishlist({
                    tenantId,
                    userId: user._id,
                    productId: selectedProductId,
                });
            }
        }
        catch (error) {
            console.error("Wishlist update failed:", error);
        }
    };
    const handleWriteReview = () => {
        if (!isAuthenticated || !user) {
            requireLogin();
            return;
        }
        setShowReviewForm(true);
    };
    const handleSubmitReview = async () => {
        if (!product) {
            return;
        }
        if (!isAuthenticated || !user) {
            requireLogin();
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
        }
        catch (error) {
            console.error("Review submission failed:", error);
            alert(error instanceof Error
                ? error.message
                : "Unable to submit review.");
        }
    };
    if (productLoading) {
        return (<><SeoHead title="Product" description="Loading product details." path={`/product-details/${productId || ""}`} tenantSlug={tenantSlug} /><PageLoader message="Loading product..." /></>);
    }
    if (productIsError || !product) {
        return (<div className={styles.state}>
        <SeoHead title="Product not found" description="This product could not be found." path={`/product-details/${productId || ""}`} tenantSlug={tenantSlug} noIndex />
        <h2>Product Not Found</h2>
        <p>Unable to load this product.</p>
      </div>);
    }

    const image = getFirstProductImage(product.images);
    const productPath = `/product-details/${product._id}`;
    const productUrl = buildCanonicalUrl(productPath, tenantSlug);
    const inStock = !isProductOutOfStock(product);

    return (<>
      <SeoHead
        title={product.name}
        description={(product.description || `${product.name} at ${tenantSlug}`).slice(0, 320)}
        path={productPath}
        tenantSlug={tenantSlug}
        image={image || null}
        type="product"
        jsonLdId={`product-${product._id}`}
        jsonLd={buildProductJsonLd({
          name: product.name,
          description: product.description || product.name,
          url: productUrl,
          image: image || null,
          brand: product.brand,
          sku: product._id,
          price: product.finalPrice ?? product.price,
          availability: inStock ? "InStock" : "OutOfStock",
          ratingValue: product.averageRating,
          reviewCount: product.reviewCount,
        })}
      />
      <ProductDetailsView product={product} reviews={reviews} isWishlisted={isWishlisted} isAddingToCart={isAdding} onAddToCart={handleAddToCart} onWishlist={handleWishlist} onWriteReview={handleWriteReview} showReviewForm={showReviewForm} reviewRating={reviewRating} reviewTitle={reviewTitle} reviewComment={reviewComment} onReviewRatingChange={setReviewRating} onReviewTitleChange={setReviewTitle} onReviewCommentChange={setReviewComment} onSubmitReview={handleSubmitReview} isSubmittingReview={isSubmittingReview} reviewsLoading={reviewsLoading}/>
    </>);
};
export default ProductDetails;
