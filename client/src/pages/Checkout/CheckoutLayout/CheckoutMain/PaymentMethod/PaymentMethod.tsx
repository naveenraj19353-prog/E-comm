import { Banknote, Check, CreditCard, Landmark, Wallet } from "lucide-react";
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
    onMethodChange?: (method: PaymentMethodType) => void;
}
const PaymentMethod = ({ selectedMethod = "upi", onMethodChange, }: PaymentMethodProps) => {
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
            return (<button key={option.id} type="button" className={`${styles.option} ${isSelected ? styles.selected : ""}`} onClick={() => onMethodChange?.(option.id)}>
              <div className={styles.icon}>
                <Icon size={19}/>
              </div>
              <div className={styles.content}>
                <strong>{option.title}</strong>
                <p>{option.description}</p>
              </div>
              <span className={`${styles.radio} ${isSelected ? styles.radioSelected : ""}`}>
                {isSelected && <Check size={13}/>}
              </span>
            </button>);
        })}
      </div>
      <div className={styles.securityNote}>
        <span className={styles.securityDot}/>
        <span>Your payment information is securely protected.</span>
      </div>
    </section>);
};
export default PaymentMethod;
