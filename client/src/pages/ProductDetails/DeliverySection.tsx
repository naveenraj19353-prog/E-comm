import { useState } from "react";
import { Truck, PackageCheck, RotateCcw, CreditCard, MapPin, } from "lucide-react";
import styles from "./ProductDetails.module.css";
const DeliverySection = () => {
    const [pincode, setPincode] = useState("");
    const [pincodeMessage, setPincodeMessage] = useState("");
    const handlePincodeCheck = () => {
        const cleanPincode = pincode.trim();
        if (!/^[1-9][0-9]{5}$/.test(cleanPincode)) {
            setPincodeMessage("Please enter a valid 6-digit pincode.");
            return;
        }
        setPincodeMessage("Delivery available. Estimated delivery in 3–5 business days.");
    };
    return (<div className={styles.deliverySection}>
      <div className={styles.deliveryHeader}>
        <div>
          <span className={styles.sectionEyebrow}>DELIVERY & SERVICES</span>
          <h3>Check delivery availability</h3>
        </div>
      </div>
      
      <div className={styles.pincodeInputWrapper}>
        <MapPin size={17}/>
        <input type="text" value={pincode} onChange={(event) => {
            setPincode(event.target.value.replace(/\D/g, ""));
            setPincodeMessage("");
        }} placeholder="Enter pincode" maxLength={6}/>
        <button type="button" onClick={handlePincodeCheck}>
          Check
        </button>
      </div>
      {pincodeMessage && (<p className={pincodeMessage.startsWith("Please")
                ? styles.pincodeError
                : styles.pincodeSuccess}>
          {pincodeMessage}
        </p>)}
      
      <div className={styles.deliveryInfo}>
        <div className={styles.deliveryItem}>
          <div className={styles.deliveryIcon}>
            <Truck size={18}/>
          </div>
          <div>
            <strong>Free Delivery</strong>
            <p>Available on orders above ₹499</p>
          </div>
        </div>
        <div className={styles.deliveryItem}>
          <div className={styles.deliveryIcon}>
            <PackageCheck size={18}/>
          </div>
          <div>
            <strong>Estimated Delivery</strong>
            <p>Delivery within 3–5 business days</p>
          </div>
        </div>
        <div className={styles.deliveryItem}>
          <div className={styles.deliveryIcon}>
            <RotateCcw size={18}/>
          </div>
          <div>
            <strong>Easy Returns</strong>
            <p>7 days return available</p>
          </div>
        </div>
        <div className={styles.deliveryItem}>
          <div className={styles.deliveryIcon}>
            <CreditCard size={18}/>
          </div>
          <div>
            <strong>Cash on Delivery</strong>
            <p>Available for selected locations</p>
          </div>
        </div>
      </div>
    </div>);
};
export default DeliverySection;
