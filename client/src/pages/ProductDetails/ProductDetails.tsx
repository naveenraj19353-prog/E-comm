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
import { shareProductToWhatsApp } from "../../features/products/api/product.api";
import { useReviews } from "../../features/reviews/hooks/useReviews";
import {
    SeoHead,
    buildCanonicalUrl,
    buildProductJsonLd,
    storeShareImage,
} from "../../features/seo";
import {
    getFirstProductImage,
    isProductOutOfStock,
} from "../../features/products/inventory";
import { isMenuBusiness, isServiceBusiness } from "../../features/tenant/businessMode";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import { useAlert } from "../../components/Modal";
const ProductDetails = () => {
    const { productId } = useParams<{
        tenantSlug: string;
        productId: string;
    }>();
    const { user, isAuthenticated } = useAuth();
    const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
    const { formatPrice } = useFormatStorePrice();
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const isMenuMode = isMenuBusiness(tenant?.businessType);
    const navigateToLogin = useNavigateToLogin();
    const { showAlert } = useAlert();
    const isCustomer =
        isAuthenticated && user?.role === "customer" && Boolean(user._id);
    const { data: productResponse, isLoading: productLoading, isError: productIsError, } = useProductDetails(productId || "", tenantId);
    const product = productResponse?.data || null;
    const { reviews, isLoading: reviewsLoading, addReview, isCreating: isSubmittingReview, } = useReviews(productId || "", tenantId, {
        enabled: Boolean(productId && tenantId && !isServiceMode),
    });
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewTitle, setReviewTitle] = useState("");
    const [reviewComment, setReviewComment] = useState("");
    const [isSharingToWhatsApp, setIsSharingToWhatsApp] = useState(false);
    const cartUserId = isCustomer ? user!._id : "";
    const cartTenantId = isCustomer ? (user!.tenantId || tenantId || "") : "";
    const { addToCart, isAdding } = useCart(cartUserId, cartTenantId, {
        enabled: Boolean(cartUserId && cartTenantId),
    });
    const {
        wishlist,
        addToWishlist,
        removeFromWishlist,
        isAdding: isAddingToWishlist,
        isRemoving: isRemovingFromWishlist,
    } = useWishlist(cartUserId, cartTenantId, {
        enabled: Boolean(cartUserId && cartTenantId),
    });
    const isWishlistPending = isAddingToWishlist || isRemovingFromWishlist;
    const isWishlisted = product
        ? wishlist.some((item) => item.productId === product._id)
        : false;
    const requireLogin = () => {
        navigateToLogin();
    };
    const handleAddToCart = async (selectedProductId: string, quantity: number, variantId?: string) => {
        if (!isCustomer || !user) {
            requireLogin();
            return;
        }
        if (!variantId) {
            showAlert(
                isServiceMode
                    ? "This service is currently unavailable."
                    : "Please select an available color and size.",
                { tone: "warning" },
            );
            return;
        }
        try {
            await addToCart({
                tenantId: cartTenantId || tenantId,
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
        if (!isCustomer || !user) {
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
        if (!isCustomer || !user) {
            requireLogin();
            return;
        }
        setShowReviewForm(true);
    };
    const handleSubmitReview = async () => {
        if (!product) {
            return;
        }
        if (!isCustomer || !user) {
            requireLogin();
            return;
        }
        if (reviewRating === 0) {
            showAlert("Please select a rating.", { tone: "warning" });
            return;
        }
        if (!reviewTitle.trim()) {
            showAlert("Please enter a review title.", { tone: "warning" });
            return;
        }
        if (!reviewComment.trim()) {
            showAlert("Please enter your review.", { tone: "warning" });
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
            showAlert("Review submitted successfully!", { tone: "success" });
        }
        catch (error) {
            console.error("Review submission failed:", error);
            showAlert(error instanceof Error
                ? error.message
                : "Unable to submit review.", { tone: "danger" });
        }
    };
    const sendProductToCustomerWhatsApp = async () => {
        if (!product || isSharingToWhatsApp) {
            return;
        }
        setIsSharingToWhatsApp(true);
        try {
            const result = await shareProductToWhatsApp(product._id);
            showAlert(result.message || "Product sent to your WhatsApp number.", {
                tone: "success",
            });
        }
        catch (error) {
            const message =
                typeof error === "object" &&
                error !== null &&
                "response" in error
                    ? String(
                          (
                              error as {
                                  response?: { data?: { detail?: string } };
                              }
                          ).response?.data?.detail ||
                              "Unable to send the product on WhatsApp.",
                      )
                    : "Unable to send the product on WhatsApp.";
            showAlert(message, { tone: "danger" });
        }
        finally {
            setIsSharingToWhatsApp(false);
        }
    };
    const handleWhatsAppShare = () => {
        if (!isCustomer) {
            navigateToLogin(undefined, () => {
                void sendProductToCustomerWhatsApp();
            });
            return;
        }
        void sendProductToCustomerWhatsApp();
    };
    if (productLoading) {
        return (<><SeoHead title="Product" description="Loading product details." path={`/product-details/${productId || ""}`} tenantSlug={tenantSlug} noIndex /><PageLoader message="Loading product..." /></>);
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
    const storeName = tenant?.name || tenantSlug || "Store";
    const priceLabel = formatPrice(product.finalPrice ?? product.price);
    const ogTitle = `${product.name} - ${priceLabel}`;
    const ogDescription = (
        product.description?.trim() ||
        `${product.name} available now at ${storeName}.`
    ).slice(0, 220);

    return (<>
      <SeoHead
        title={ogTitle}
        description={`${ogDescription}${ogDescription.includes(priceLabel) ? "" : ` · ${priceLabel}`}`}
        path={productPath}
        tenantSlug={tenantSlug}
        image={image || storeShareImage(tenant) || null}
        type="product"
        siteName={storeName}
        jsonLdId={`product-${product._id}`}
        jsonLd={buildProductJsonLd({
          name: product.name,
          description: product.description || product.name,
          url: productUrl,
          image: image || null,
          brand: product.brand || storeName,
          sku: product._id,
          price: product.finalPrice ?? product.price,
          availability: inStock ? "InStock" : "OutOfStock",
          ratingValue: isServiceMode ? undefined : product.averageRating,
          reviewCount: isServiceMode ? undefined : product.reviewCount,
        })}
      />
      <ProductDetailsView
        product={product}
        reviews={isServiceMode ? [] : reviews}
        isWishlisted={isWishlisted}
        isAddingToCart={isAdding}
        isSharingToWhatsApp={isSharingToWhatsApp}
        isWishlistPending={isWishlistPending}
        onAddToCart={handleAddToCart}
        onWishlist={handleWishlist}
        onWhatsAppShare={handleWhatsAppShare}
        isServiceMode={isServiceMode}
        isMenuMode={isMenuMode}
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
        reviewsLoading={isServiceMode ? false : reviewsLoading}
      />
    </>);
};
export default ProductDetails;
