import styles from "./CheckoutHeader.module.css";
const CheckoutHeader = () => {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>CHECKOUT</span>
      <h1>Complete your order</h1>
      <p>Review your details and place your order securely.</p>
    </header>
  );
};
export default CheckoutHeader;
