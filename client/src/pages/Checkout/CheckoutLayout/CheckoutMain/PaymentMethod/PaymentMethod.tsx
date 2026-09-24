import { Banknote, Check, CreditCard, Landmark, Sparkles, Wallet } from "lucide-react";
import { useFormatStorePrice } from "../../../../../features/tenant/useFormatStorePrice";
import styles from "./PaymentMethod.module.css";
export type PaymentMethodType = "card" | "upi" | "netbanking" | "cod";
type PaymentOption = {
    id: PaymentMethodType;
    title: string;
    description: string;
    icon: typeof CreditCard;
};
const PAYMENT_OPTIONS: PaymentOption[] = [
    {
        id: "upi",
        title: "UPI",
        description: "GPay, PhonePe, Paytm, BHIM or any UPI ID",
        icon: Wallet,
    },
    {
        id: "card",
        title: "Credit / Debit Card",
        description: "Visa, Mastercard, RuPay and more",
        icon: CreditCard,
    },
    {
        id: "netbanking",
        title: "Net Banking",
        description: "Pay directly from your bank account",
        icon: Landmark,
    },
    {
        id: "cod",
        title: "Cash on Delivery",
        description: "Pay when your order is delivered",
        icon: Banknote,
    },
];
interface PaymentMethodProps {
    selectedMethod?: PaymentMethodType;
    shippingQuoted?: boolean;
    /** The plain delivery fee, the same whichever method is chosen. */
    deliveryCharge?: number;
    /** What the delivery partner bills extra for COD on this order, or null
     * while it isn't known yet (no address picked, or the partner didn't quote). */
    codHandlingCharge?: number | null;
    onMethodChange?: (method: PaymentMethodType) => void;
}
const PaymentMethod = ({
    selectedMethod = "upi",
    shippingQuoted = false,
    deliveryCharge = 0,
    codHandlingCharge = null,
    onMethodChange,
}: PaymentMethodProps) => {
    const { formatPrice } = useFormatStorePrice();
    const hasCodHandlingCharge = shippingQuoted && Boolean(codHandlingCharge && codHandlingCharge > 0);
    return (<section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PAYMENT</span>
          <h2>Payment Method</h2>
          <p>Select a secure payment method for your order.</p>
        </div>
      </div>
      <div className={styles.options}>
        {PAYMENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedMethod === option.id;
            const isCod = option.id === "cod";
            return (<button key={option.id} type="button" className={`${styles.option} ${isSelected ? styles.selected : ""}`} onClick={() => onMethodChange?.(option.id)}>
              <div className={styles.icon}>
                <Icon size={19}/>
              </div>
              <div className={styles.content}>
                <strong>{option.title}</strong>
                <p>
                  {isCod && shippingQuoted
                      ? deliveryCharge > 0
                          ? `Pay when delivered. Delivery charge ${formatPrice(deliveryCharge)}`
                          : "Pay when delivered. Delivery charge applied at checkout"
                      : option.description}
                </p>
                {isCod && hasCodHandlingCharge && (
                    <p className={styles.codBreakdown}>
                        + {formatPrice(codHandlingCharge as number)} COD handling charge
                    </p>
                )}
              </div>
              <span className={`${styles.radio} ${isSelected ? styles.radioSelected : ""}`}>
                {isSelected && <Check size={13}/>}
              </span>
            </button>);
        })}
      </div>
      {selectedMethod === "cod" && hasCodHandlingCharge && (
          <div className={styles.saveNudge}>
              <Sparkles size={15}/>
              <span>
                  Pay via UPI or Card instead to save the {formatPrice(codHandlingCharge as number)} COD handling charge.
              </span>
          </div>
      )}
      <div className={styles.securityNote}>
        <span className={styles.securityDot}/>
        <span>Your payment information is securely protected.</span>
      </div>
    </section>);
};
export default PaymentMethod;
