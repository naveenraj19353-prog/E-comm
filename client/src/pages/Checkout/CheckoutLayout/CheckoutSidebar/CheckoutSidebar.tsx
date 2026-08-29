import { Check, ChevronRight, Lock, Tag, Truck } from "lucide-react";
import styles from "./CheckoutSidebar.module.css";
interface CheckoutItem {
    id: string;
    name: string;
    image: string;
    quantity: number;
    price: number;
}
interface CheckoutSidebarProps {
    items?: CheckoutItem[];
    subtotal?: number;
    deliveryCharge?: number;
    discount?: number;
    total?: number;
    onPlaceOrder?: () => void;
    isPlacingOrder?: boolean;
}
const CheckoutSidebar = ({ items = [], subtotal = 0, deliveryCharge = 0, discount = 0, total = 0, onPlaceOrder, isPlacingOrder = false, }: CheckoutSidebarProps) => {
    const formatPrice = (value: number) => `₹${value.toLocaleString("en-IN")}`;
    return (<aside className={styles.sidebar}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>YOUR ORDER</span>
            <h2>Order Summary</h2>
          </div>
          <span className={styles.itemCount}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
        {items.length > 0 && (<div className={styles.items}>
            {items.map((item) => (<div key={item.id} className={styles.item}>
                <div className={styles.imageWrapper}>
                  <img src={item.image} alt={item.name} className={styles.image}/>
                  <span className={styles.quantity}>{item.quantity}</span>
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemDetails}>
                    <h3>{item.name}</h3>
                    <span>Qty: {item.quantity}</span>
                  </div>
                  <strong className={styles.itemPrice}>
                    {formatPrice(item.price * item.quantity)}
                  </strong>
                </div>
              </div>))}
          </div>)}
        <div className={styles.divider}/>
        <div className={styles.priceDetails}>
          <div className={styles.priceRow}>
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <div className={styles.priceRow}>
            <span className={styles.deliveryLabel}>
              <Truck size={15}/>
              Delivery
            </span>
            {deliveryCharge === 0 ? (<strong className={styles.free}>FREE</strong>) : (<strong>{formatPrice(deliveryCharge)}</strong>)}
          </div>
          {discount > 0 && (<div className={styles.priceRow}>
              <span className={styles.discountLabel}>
                <Tag size={15}/>
                Discount
              </span>
              <strong className={styles.discount}>
                -{formatPrice(discount)}
              </strong>
            </div>)}
        </div>
        <div className={styles.divider}/>
        <div className={styles.total}>
          <div>
            <span>Total</span>
            <small>Inclusive of all taxes</small>
          </div>
          <strong>{formatPrice(total)}</strong>
        </div>
        <button type="button" className={styles.placeOrder} disabled={isPlacingOrder} onClick={onPlaceOrder}>
          {isPlacingOrder ? "Placing Order..." : "Place Order"}
          {!isPlacingOrder && <ChevronRight size={18}/>}
        </button>
        <div className={styles.secure}>
          <Lock size={14}/>
          <span>Secure and encrypted checkout</span>
          <Check size={14}/>
        </div>
      </div>
      <div className={styles.trustCard}>
        <div className={styles.trustItem}>
          <Truck size={18}/>
          <div>
            <strong>Free Delivery</strong>
            <span>On eligible orders</span>
          </div>
        </div>
        <div className={styles.trustItem}>
          <Check size={18}/>
          <div>
            <strong>Easy Returns</strong>
            <span>7 days return available</span>
          </div>
        </div>
        <div className={styles.trustItem}>
          <Lock size={18}/>
          <div>
            <strong>Secure Payment</strong>
            <span>Your payment is protected</span>
          </div>
        </div>
      </div>
    </aside>);
};
export default CheckoutSidebar;
