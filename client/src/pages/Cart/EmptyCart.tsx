import { ArrowRight, ShoppingBag } from "lucide-react";
import styles from "./Cart.module.css";
const EmptyCart = () => {
    return (<div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <ShoppingBag size={38}/>
      </div>
      <h1>Your cart is empty</h1>
      <p>Looks like you haven't added anything to your cart yet.</p>
      <button type="button" className={styles.shopButton}>
        Start Shopping
        <ArrowRight size={17}/>
      </button>
    </div>);
};
export default EmptyCart;
