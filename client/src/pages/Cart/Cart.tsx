import { useEffect } from "react";
import { useCart } from "../../features/cart/hooks/useCart";
import CartHeader from "./CartHeader";
import FreeDeliveryBanner from "./FreeDeliveryBanner";
import CartItem from "./CartItem";
import CartSummary from "./CartSummary";
import EmptyCart from "./EmptyCart";
import CartLoading from "./CartLoading";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import styles from "./Cart.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useNavigateToLogin } from "../../features/auth/hooks/useNavigateToLogin";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import {
    isMenuBusiness,
    isRetailBusiness,
    isServiceBusiness,
} from "../../features/tenant/businessMode";

const Cart = () => {
    const { user, isAuthenticated } = useAuth();
    const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
    const navigateToLogin = useNavigateToLogin();
    const isRetail = isRetailBusiness(tenant?.businessType);
    const isMenu = isMenuBusiness(tenant?.businessType);
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const isCustomer =
        isAuthenticated && user?.role === "customer" && Boolean(user._id);
    const cartUserId = isCustomer ? user!._id : "";
    const cartTenantId = isCustomer ? (user!.tenantId || tenantId || "") : "";
    const {
        cart,
        grandTotal,
        cartCount,
        isLoading,
        isUpdating,
        isRemoving,
        isClearing,
        updateCart,
        removeFromCart,
        clearCart,
    } = useCart(cartUserId, cartTenantId);
    const layoutSettings = useLayoutSettings();

    useEffect(() => {
        if (!isCustomer) {
            navigateToLogin();
        }
    }, [isCustomer, navigateToLogin]);

    if (!isCustomer) {
        return null;
    }
    if (isLoading) {
        return <CartLoading />;
    }
    if (cart.length === 0) {
        return <EmptyCart />;
    }

    const showSummary = isRetail || isMenu;

    return (
        <div className={styles.container}>
            <CartHeader
                cartCount={cartCount}
                onClearCart={clearCart}
                isClearing={isClearing}
                showClearCart={!isMenu}
            />
            {isRetail ? <FreeDeliveryBanner /> : null}
            <div
                className={`${styles.layout} ${
                    showSummary && layoutSettings.cartLayout === "stacked"
                        ? styles.layoutStacked
                        : showSummary
                          ? styles.layoutSplit
                          : styles.layoutStacked
                }`}
            >
                <div className={styles.items}>
                    {cart.map((item) => (
                        <CartItem
                            key={item.productId}
                            item={item}
                            isUpdating={isUpdating}
                            isRemoving={isRemoving}
                            allowQuantityUpdates={!isServiceMode && !isMenu}
                            allowRemove={!isMenu}
                            onUpdateQuantity={updateCart}
                            onRemove={removeFromCart}
                        />
                    ))}
                </div>
                {isRetail ? (
                    <CartSummary
                        cartCount={cartCount}
                        grandTotal={grandTotal}
                        tenantId={tenantSlug}
                        mode="checkout"
                    />
                ) : null}
                {isMenu ? (
                    <CartSummary
                        cartCount={cartCount}
                        grandTotal={grandTotal}
                        tenantId={tenantSlug}
                        mode="summary"
                    />
                ) : null}
            </div>
        </div>
    );
};

export default Cart;
