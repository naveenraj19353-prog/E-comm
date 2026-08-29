import { Check, ChevronRight, Lock, Tag, Truck } from "lucide-react";
import type { PaymentMethodType } from "../CheckoutMain/PaymentMethod/PaymentMethod";
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
    appliedCoupon?: string | null;
    total?: number;
    paymentMethod?: PaymentMethodType;
    onPlaceOrder?: () => void;
    isPlacingOrder?: boolean;
    isPreviewLoading?: boolean;
}

const CheckoutSidebar = ({
    items = [],
    subtotal = 0,
    deliveryCharge = 0,
    discount = 0,
    appliedCoupon = null,
    total = 0,
    paymentMethod = "upi",
    onPlaceOrder,
    isPlacingOrder = false,
    isPreviewLoading = false,
}: CheckoutSidebarProps) => {
    const formatPrice = (value: number) => `₹${value.toLocaleString("en-IN")}`;
    const isCod = paymentMethod === "cod";
    const placeOrderLabel = isPlacingOrder
        ? "Placing Order..."
        : isCod
            ? "Place Order · Pay on Delivery"
            : `Pay ${formatPrice(total)}`;

    return (
        <aside className={styles.sidebar}>
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

                {items.length > 0 && (
                    <div className={styles.items}>
                        {items.map((item) => (
                            <div key={item.id} className={styles.item}>
                                <div className={styles.imageWrapper}>
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className={styles.image}
                                    />
                                    <span className={styles.quantity}>
                                        {item.quantity}
                                    </span>
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
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.divider} />

                <div className={styles.priceDetails}>
                    <div className={styles.priceRow}>
                        <span>Subtotal</span>
                        <strong>
                            {isPreviewLoading ? "..." : formatPrice(subtotal)}
                        </strong>
                    </div>
                    <div className={styles.priceRow}>
                        <span className={styles.deliveryLabel}>
                            <Truck size={15} />
                            Delivery
                        </span>
                        {isPreviewLoading ? (
                            <strong>...</strong>
                        ) : deliveryCharge === 0 ? (
                            <strong className={styles.free}>FREE</strong>
                        ) : (
                            <strong>{formatPrice(deliveryCharge)}</strong>
                        )}
                    </div>
                    {discount > 0 && (
                        <div className={styles.priceRow}>
                            <span className={styles.discountLabel}>
                                <Tag size={15} />
                                Discount
                                {appliedCoupon ? ` (${appliedCoupon})` : ""}
                            </span>
                            <strong className={styles.discount}>
                                -{formatPrice(discount)}
                            </strong>
                        </div>
                    )}
                </div>

                <div className={styles.divider} />

                <div className={styles.total}>
                    <div>
                        <span>Total</span>
                    </div>
                    <strong>
                        {isPreviewLoading ? "..." : formatPrice(total)}
                    </strong>
                </div>

                <button
                    type="button"
                    className={styles.placeOrder}
                    disabled={isPlacingOrder || isPreviewLoading}
                    onClick={onPlaceOrder}
                >
                    {placeOrderLabel}
                    {!isPlacingOrder && <ChevronRight size={18} />}
                </button>

                <div className={styles.secure}>
                    <Lock size={14} />
                    <span>
                        {isCod
                            ? "Pay in cash when your order arrives"
                            : "Secure and encrypted checkout"}
                    </span>
                    <Check size={14} />
                </div>
            </div>

            <div className={styles.trustCard}>
                <div className={styles.trustItem}>
                    <Truck size={18} />
                    <div>
                        <strong>Free Delivery</strong>
                        <span>On orders ₹1,000 and above</span>
                    </div>
                </div>
                <div className={styles.trustItem}>
                    <Check size={18} />
                    <div>
                        <strong>Easy Returns</strong>
                        <span>7 days return available</span>
                    </div>
                </div>
                <div className={styles.trustItem}>
                    <Lock size={18} />
                    <div>
                        <strong>Secure Payment</strong>
                        <span>
                            {isCod ? "COD available" : "Razorpay protected"}
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default CheckoutSidebar;
