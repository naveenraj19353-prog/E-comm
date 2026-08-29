import { useCallback, useState } from "react";
import { useAppSelector } from "../../../app/hooks";
import { useCart } from "../../cart/hooks/useCart";
import { useWishlist } from "../../wishlist/hooks/useWishlist";
import { useStorefrontTenant } from "../../tenant/useTenant";
import { useNavigateToLogin } from "../../auth/hooks/useNavigateToLogin";

type UseStorefrontProductActionsOptions = {
    trackAddingProductId?: boolean;
};

export function useStorefrontProductActions(options: UseStorefrontProductActionsOptions = {}) {
    const { trackAddingProductId = false } = options;
    const { tenantId: storeTenantId } = useStorefrontTenant();
    const user = useAppSelector((state) => state.auth.user);
    const navigateToLogin = useNavigateToLogin();
    const tenantId = user?.tenantId || storeTenantId;
    const userId = user?._id ?? "";
    const { addToCart } = useCart(userId, tenantId);
    const { wishlist, addToWishlist, removeFromWishlist } = useWishlist(userId, tenantId);
    const [addingProductId, setAddingProductId] = useState<string | null>(null);

    const ensureAuthenticated = useCallback(() => {
        if (!userId || !tenantId) {
            navigateToLogin();
            return false;
        }
        return true;
    }, [navigateToLogin, tenantId, userId]);

    const isProductWishlisted = useCallback((productId: string) => {
        return wishlist.some((item) => item.productId === productId);
    }, [wishlist]);

    const handleWishlist = useCallback(async (productId: string, isAdding: boolean) => {
        if (!ensureAuthenticated()) {
            return;
        }
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
    }, [addToWishlist, ensureAuthenticated, removeFromWishlist, tenantId, userId]);

    const toggleWishlist = useCallback(async (productId: string) => {
        if (!ensureAuthenticated()) {
            return;
        }
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
    }, [addToWishlist, ensureAuthenticated, isProductWishlisted, removeFromWishlist, tenantId, userId]);

    const handleAddToCart = useCallback(async (
        productId: string,
        variantId: string,
        color: string,
        size: string,
    ) => {
        if (!ensureAuthenticated()) {
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
    }, [addToCart, ensureAuthenticated, tenantId, trackAddingProductId, userId]);

    return {
        wishlist,
        addingProductId,
        isProductWishlisted,
        handleWishlist,
        toggleWishlist,
        handleAddToCart,
        navigateToLogin,
    };
}
