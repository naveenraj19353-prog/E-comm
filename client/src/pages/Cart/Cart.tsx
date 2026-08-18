import { useCart } from "../../features/cart/hooks/useCart";
import CartHeader from "./CartHeader";
import FreeDeliveryBanner from "./FreeDeliveryBanner";
import CartItem from "./CartItem";
import CartSummary from "./CartSummary";
import EmptyCart from "./EmptyCart";
import CartLoading from "./CartLoading";
import styles from "./Cart.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";
const Cart = () => {
  const user = useAuth().user;
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
  } = useCart(user?._id as string, user?.tenantId as string);
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
        <CartSummary cartCount={cartCount} grandTotal={grandTotal} tenantId={user?.tenantId as string}/>
      </div>
    </div>
  );
};
export default Cart;
