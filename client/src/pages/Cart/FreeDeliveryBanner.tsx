import { Truck } from "lucide-react";
import styles from "./Cart.module.css";
const FreeDeliveryBanner = () => {
    return (<div className={styles.deliveryBanner}>
      <div className={styles.deliveryIcon}>
        <Truck size={18}/>
      </div>
      <div>
        <strong>Free delivery</strong>
        <span>Enjoy free delivery on your order.</span>
      </div>
    </div>);
};
export default FreeDeliveryBanner;
