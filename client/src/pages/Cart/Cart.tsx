import { useCart } from "../../features/cart/hooks/useCart";

import CartHeader from "./CartHeader";
import FreeDeliveryBanner from "./FreeDeliveryBanner";
import CartItem from "./CartItem";
import CartSummary from "./CartSummary";
import EmptyCart from "./EmptyCart";
import CartLoading from "./CartLoading";

import styles from "./Cart.module.css";

const Cart = () => {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

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
  } = useCart(userId, tenantId);

  if (isLoading) {
    return <CartLoading />;
  }

  if (cart.length === 0) {
    return <EmptyCart />;
  }

  return (
    <div className={styles.container}>
      <CartHeader
        cartCount={cartCount}
        onClearCart={clearCart}
        isClearing={isClearing}
      />

      <FreeDeliveryBanner />

      <div className={styles.layout}>
        <div className={styles.items}>
          {cart.map((item) => (
            <CartItem
              key={item.productId}
              item={item}
              isUpdating={isUpdating}
              isRemoving={isRemoving}
              onUpdateQuantity={updateCart}
              onRemove={removeFromCart}
            />
          ))}
        </div>

        <CartSummary cartCount={cartCount} grandTotal={grandTotal} />
      </div>
    </div>
  );
};

export default Cart;
