import { useState } from "react";
import { Truck, PackageCheck, RotateCcw, CreditCard, MapPin, } from "lucide-react";
import styles from "./ProductDetails.module.css";
const ProductDelivery = () => {
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
    return (<section className={styles.deliverySection}>
      <div className={styles.deliveryHeader}>
        <span className={styles.sectionEyebrow}>DELIVERY & SERVICES</span>
        <h3>Check delivery availability</h3>
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
        <DeliveryItem icon={<Truck size={18}/>} title="Free Delivery" description="Available on orders above ₹499"/>
        <DeliveryItem icon={<PackageCheck size={18}/>} title="Estimated Delivery" description="Delivery within 3–5 business days"/>
        <DeliveryItem icon={<RotateCcw size={18}/>} title="Easy Returns" description="7 days return available"/>
        <DeliveryItem icon={<CreditCard size={18}/>} title="Cash on Delivery" description="Available for selected locations"/>
      </div>
    </section>);
};
interface DeliveryItemProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}
const DeliveryItem = ({ icon, title, description }: DeliveryItemProps) => {
    return (<div className={styles.deliveryItem}>
      <div className={styles.deliveryIcon}>{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>);
};
export default ProductDelivery;
