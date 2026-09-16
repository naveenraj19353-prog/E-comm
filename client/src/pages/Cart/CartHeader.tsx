import { ShoppingBag } from "lucide-react";
import styles from "./Cart.module.css";
interface CartHeaderProps {
    cartCount: number;
    isClearing: boolean;
    onClearCart: () => void;
    showClearCart?: boolean;
}
const CartHeader = ({
    cartCount,
    isClearing,
    onClearCart,
    showClearCart = true,
}: CartHeaderProps) => {
    return (<div className={styles.header}>
      <div className={styles.headerMain}>
        <div className={styles.eyebrow}>
          <ShoppingBag size={15}/>
          Your Bag
        </div>
        <h1>Shopping Cart</h1>
        <p>
          {cartCount} {cartCount === 1 ? "item" : "items"} in your cart
        </p>
        {showClearCart ? (
          <button type="button" className={styles.clearCart} onClick={onClearCart} disabled={isClearing}>
            {isClearing ? "Clearing..." : "Clear Cart"}
          </button>
        ) : null}
      </div>
    </div>);
};
export default CartHeader;
