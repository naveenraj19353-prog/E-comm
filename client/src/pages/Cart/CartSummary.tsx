import { ArrowRight } from "lucide-react";

import styles from "./Cart.module.css";

interface CartSummaryProps {
  cartCount: number;
  grandTotal: number;
}

const CartSummary = ({
  cartCount,
  grandTotal,
}: CartSummaryProps) => {
  return (
    <aside className={styles.summary}>
      <div className={styles.summaryHeader}>
        <h2>Order Summary</h2>

        <span>
          {cartCount} {cartCount === 1 ? "item" : "items"}
        </span>
      </div>

      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span>Subtotal</span>

          <span>
            ₹{grandTotal.toLocaleString("en-IN")}
          </span>
        </div>

        <div className={styles.summaryRow}>
          <span>Delivery</span>

          <span className={styles.free}>
            FREE
          </span>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.total}>
        <div>
          <span>Total</span>

          <small>Inclusive of all taxes</small>
        </div>

        <strong>
          ₹{grandTotal.toLocaleString("en-IN")}
        </strong>
      </div>

      <button
        type="button"
        className={styles.checkout}
      >
        Proceed To Checkout
        <ArrowRight size={18} />
      </button>

      <div className={styles.secure}>
        <span className={styles.secureDot} />
        Secure checkout
      </div>
    </aside>
  );
};

export default CartSummary;