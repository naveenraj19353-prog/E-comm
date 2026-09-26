import { useAuth } from "./useAuth";

/**
 * Who is currently looking at the storefront.
 *
 * Three states matter, and conflating them is what let a signed-in store admin
 * reach shopper features:
 *
 * - guest  — not signed in. Show the shopper controls; clicking one prompts a
 *            sign-in, because they legitimately can still become a customer.
 * - customer — a real shopper. Everything works.
 * - staff  — signed in but not as a customer (store admin, manager, super
 *            admin). Shopper features are hidden: prompting an already
 *            signed-in admin to "log in" is what made this confusing.
 */
export function useShopperIdentity() {
    const { user, isAuthenticated } = useAuth();
    const isCustomer =
        isAuthenticated && user?.role === "customer" && Boolean(user._id);
    const isStaff = isAuthenticated && !isCustomer;

    return {
        user,
        isAuthenticated,
        isCustomer,
        /** Authenticated as something other than a customer. */
        isStaff,
        /** The storefront's shopper features (cart, wishlist, checkout). */
        canShop: isCustomer,
        /** Signed in, but not as a shopper — show an account hint instead. */
        isGuest: !isAuthenticated,
    };
}
