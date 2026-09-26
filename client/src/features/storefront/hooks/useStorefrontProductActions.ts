import { useCallback, useState } from "react";
import { useCart } from "../../cart/hooks/useCart";
import { useWishlist } from "../../wishlist/hooks/useWishlist";
import { useStorefrontTenant } from "../../tenant/useTenant";
import { useNavigateToLogin } from "../../auth/hooks/useNavigateToLogin";
import { useShopperIdentity } from "../../auth/hooks/useShopperIdentity";

type UseStorefrontProductActionsOptions = {
    /**
     * Tracks which product is being added so its card can show a busy state.
     * On by default â€” every surface that renders a card wants the feedback.
     */
    trackAddingProductId?: boolean;
};

export function useStorefrontProductActions(options: UseStorefrontProductActionsOptions = {}) {
    const { trackAddingProductId = true } = options;
    const { tenantId: storeTenantId } = useStorefrontTenant();
    const { user, isCustomer, isGuest, isStaff, canShop } = useShopperIdentity();
    const navigateToLogin = useNavigateToLogin();
    const tenantId = isCustomer ? (user!.tenantId || storeTenantId || "") : "";
    const userId = isCustomer ? user!._id : "";
    const { addToCart } = useCart(userId, tenantId, { enabled: isCustomer });
    const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(
        userId,
        tenantId,
        { enabled: isCustomer },
    );
    const [addingProductId, setAddingProductId] = useState<string | null>(null);
    const [wishlistPendingId, setWishlistPendingId] = useState<string | null>(null);

    const ensureShopper = useCallback(() => {
        if (canShop) {
            return true;
        }
        // A guest can still become a customer, so prompting them is right.
        // Someone already signed in as staff must not be asked to "log in" â€”
        // cart and wishlist simply do not apply to them.
        if (isGuest) {
            navigateToLogin();
        }
        return false;
    }, [canShop, isGuest, navigateToLogin]);

    const isProductWishlisted = useCallback((productId: string) => {
        return wishlist.some((item) => item.productId === productId);
    }, [wishlist]);

    const handleWishlist = useCallback(async (productId: string, isAdding: boolean) => {
        if (!ensureShopper()) {
            return;
        }
        setWishlistPendingId(productId);
        try {
            if (isAdding) {
                await addToWishlist({ tenantId, userId, productId });
                console.log("Product added to wishlist");
            }
            else {
                await removeFromWishlist(productId);
                console.log("Product removed from wishlist");
            }
        }
        catch (error) {
            console.error("Wishlist operation failed:", error);
        }
        finally {
            setWishlistPendingId(null);
        }
    }, [addToWishlist, ensureShopper, removeFromWishlist, tenantId, userId]);

    const toggleWishlist = useCallback(async (productId: string) => {
        if (!ensureShopper()) {
            return;
        }
        setWishlistPendingId(productId);
        try {
            if (isProductWishlisted(productId)) {
                await removeFromWishlist(productId);
                console.log("Removed from wishlist");
            }
            else {
                await addToWishlist({ tenantId, userId, productId });
                console.log("Added to wishlist");
            }
        }
        catch (error) {
            console.error("Wishlist update failed:", error);
        }
        finally {
            setWishlistPendingId(null);
        }
    }, [addToWishlist, ensureShopper, isProductWishlisted, removeFromWishlist, tenantId, userId]);

    const isWishlistPending = useCallback(
        (productId: string) => wishlistPendingId === productId,
        [wishlistPendingId],
    );

    const handleAddToCart = useCallback(async (
        productId: string,
        variantId: string,
        color: string,
        size: string,
    ) => {
        if (!ensureShopper()) {
            return;
        }
        if (!variantId) {
            console.log("No available variant selected");
            return;
        }
        try {
            if (trackAddingProductId) {
                setAddingProductId(productId);
            }
            const payload = {
                tenantId,
                userId,
                productId,
                variantId,
                quantity: 1,
                color,
                size,
            };
            if (trackAddingProductId) {
                console.log("ADD TO CART:", payload);
            }
            else {
                console.log("ADD TO CART PAYLOAD:", payload);
            }
            await addToCart(payload);
            if (!trackAddingProductId) {
                console.log("Product added to cart");
            }
        }
        catch (error) {
            console.error("Add to cart failed:", error);
        }
        finally {
            if (trackAddingProductId) {
                setAddingProductId(null);
            }
        }
    }, [addToCart, ensureShopper, tenantId, trackAddingProductId, userId]);

    return {
        wishlist,
        // Surfaces use this to hide cart/wishlist controls for staff accounts.
        canShop,
        isStaff,
        addingProductId,
        wishlistPendingId,
        isProductWishlisted,
        isWishlistPending,
        handleWishlist,
        toggleWishlist,
        handleAddToCart,
        navigateToLogin,
    };
}
