import { useEffect, useState } from "react";
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
        isClearing,
        updateCart,
        removeFromCart,
        clearCart,
    } = useCart(cartUserId, cartTenantId);
    const layoutSettings = useLayoutSettings();
    // Per-row busy state: only the row being acted on should show a spinner.
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
    const [removingItemId, setRemovingItemId] = useState<string | null>(null);

    const handleUpdateQuantity = async (data: {
        productId: string;
        quantity: number;
    }) => {
        setUpdatingItemId(data.productId);
        try {
            await updateCart(data);
        } catch (error) {
            console.error("Cart update failed:", error);
        } finally {
            setUpdatingItemId(null);
        }
    };

    const handleRemoveItem = async (productId: string) => {
        setRemovingItemId(productId);
        try {
            await removeFromCart(productId);
        } catch (error) {
            console.error("Cart remove failed:", error);
        } finally {
            setRemovingItemId(null);
        }
    };

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
            {isRetail && tenant?.freeDeliveryThreshold ? (
                <FreeDeliveryBanner threshold={tenant.freeDeliveryThreshold} cartTotal={grandTotal} />
            ) : null}
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
                            isUpdating={updatingItemId === item.productId}
                            isRemoving={removingItemId === item.productId}
                            allowQuantityUpdates={!isServiceMode && !isMenu}
                            allowRemove={!isMenu}
                            onUpdateQuantity={handleUpdateQuantity}
                            onRemove={handleRemoveItem}
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
