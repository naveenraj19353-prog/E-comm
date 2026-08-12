import CheckoutHeader from "./CheckoutHeader/CheckoutHeader";
import CheckoutLayout from "./CheckoutLayout/CheckoutLayout";
import CheckoutMain from "./CheckoutLayout/CheckoutMain/CheckoutMain";

import styles from "./Checkout.module.css";
import AddressSection from "./CheckoutLayout/CheckoutMain/AddressSection/AddressSection";
import DeliveryMethod from "./CheckoutLayout/CheckoutMain/DeliveryMethod/DeliveryMethod";
import PaymentMethod from "./CheckoutLayout/CheckoutMain/PaymentMethod/PaymentMethod";
import CheckoutSidebar from "./CheckoutLayout/CheckoutSidebar/CheckoutSidebar";

const Checkout = () => {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <CheckoutHeader />

        <CheckoutLayout
          main={
            <CheckoutMain>
              <AddressSection />
              <DeliveryMethod />
              <PaymentMethod />
            </CheckoutMain>
          }
          sidebar={
            <>
              <CheckoutSidebar />
            </>
          }
        />
      </div>
    </div>
  );
};

export default Checkout;