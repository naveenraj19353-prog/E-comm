import { Check, Truck, Zap } from "lucide-react";

import styles from "./DeliveryMethod.module.css";

type DeliveryOption = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  price: number;
  icon: typeof Truck;
};

const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: "standard",
    title: "Standard Delivery",
    description: "Reliable delivery to your doorstep",
    estimatedTime: "3–5 business days",
    price: 0,
    icon: Truck,
  },
  {
    id: "express",
    title: "Express Delivery",
    description: "Get your order delivered faster",
    estimatedTime: "1–2 business days",
    price: 99,
    icon: Zap,
  },
];

interface DeliveryMethodProps {
  selectedMethod?: string;
  onMethodChange?: (method: string) => void;
}

const DeliveryMethod = ({
  selectedMethod = "standard",
  onMethodChange,
}: DeliveryMethodProps) => {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>DELIVERY</span>

          <h2>Delivery Method</h2>

          <p>Choose how you want your order delivered.</p>
        </div>
      </div>

      <div className={styles.options}>
        {DELIVERY_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedMethod === option.id;

          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${
                isSelected ? styles.selected : ""
              }`}
              onClick={() => onMethodChange?.(option.id)}
            >
              <div className={styles.icon}>
                <Icon size={19} />
              </div>

              <div className={styles.content}>
                <div className={styles.titleRow}>
                  <strong>{option.title}</strong>

                  {option.price === 0 ? (
                    <span className={styles.free}>FREE</span>
                  ) : (
                    <span className={styles.price}>
                      ₹{option.price}
                    </span>
                  )}
                </div>

                <p>{option.description}</p>

                <span className={styles.time}>
                  {option.estimatedTime}
                </span>
              </div>

              <span
                className={`${styles.radio} ${
                  isSelected ? styles.radioSelected : ""
                }`}
              >
                {isSelected && <Check size={13} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DeliveryMethod;