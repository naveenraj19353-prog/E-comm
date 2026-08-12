import { ShoppingBag } from "lucide-react";

import styles from "./Cart.module.css";

const CartLoading = () => {
  return (
    <div className={styles.loading}>
      <div className={styles.loader}>
        <ShoppingBag size={24} />
      </div>

      <span>Loading your cart...</span>
    </div>
  );
};

export default CartLoading;