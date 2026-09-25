import { Truck } from "lucide-react";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import styles from "./Cart.module.css";

type Props = {
    /** The store's free-delivery order value (INR). */
    threshold: number;
    /** Current cart value (before coupon discounts). */
    cartTotal: number;
};

/** Free delivery from the store's threshold (REQ-087). Checkout applies it; this only explains it. */
const FreeDeliveryBanner = ({ threshold, cartTotal }: Props) => {
    const { formatPrice } = useFormatStorePrice();
    const remaining = Math.max(threshold - cartTotal, 0);
    return (<div className={styles.deliveryBanner}>
      <div className={styles.deliveryIcon}>
        <Truck size={18}/>
      </div>
      <div>
        {remaining > 0 ? (<>
            <strong>Add {formatPrice(remaining)} more for free delivery</strong>
            <span>Free delivery on orders of {formatPrice(threshold)} or more (after discounts).</span>
          </>) : (<>
            <strong>Free delivery</strong>
            <span>Your order qualifies for free delivery. Cash on Delivery orders still pay the COD fee.</span>
          </>)}
      </div>
    </div>);
};
export default FreeDeliveryBanner;
