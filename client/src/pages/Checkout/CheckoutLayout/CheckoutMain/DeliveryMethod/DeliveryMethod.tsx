import { useState } from "react";
import { Check, Clock, Truck } from "lucide-react";
import styles from "./DeliveryMethod.module.css";
export interface DeliveryOption {
    id: string;
    name: string;
    description: string;
    estimatedTime: string;
    price: number;
}
const DELIVERY_OPTIONS: DeliveryOption[] = [
    {
        id: "standard",
        name: "Standard Delivery",
        description: "Reliable delivery at no extra cost.",
        estimatedTime: "3–5 business days",
        price: 0,
    },
    {
        id: "express",
        name: "Express Delivery",
        description: "Get your order delivered faster.",
        estimatedTime: "1–2 business days",
        price: 99,
    },
];
interface DeliveryMethodProps {
    onDeliveryChange?: (option: DeliveryOption) => void;
}
const DeliveryMethod = ({ onDeliveryChange }: DeliveryMethodProps) => {
    const [selectedMethod, setSelectedMethod] = useState("standard");
    const handleSelect = (option: DeliveryOption) => {
        setSelectedMethod(option.id);
        onDeliveryChange?.(option);
    };
    return (<section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>DELIVERY</span>
          <h2>Choose delivery method</h2>
          <p>Select how you would like to receive your order.</p>
        </div>
      </div>
      <div className={styles.options}>
        {DELIVERY_OPTIONS.map((option) => {
            const isSelected = selectedMethod === option.id;
            return (<button key={option.id} type="button" className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`} onClick={() => handleSelect(option)}>
              <div className={styles.icon}>
                {option.id === "express" ? (<Truck size={20}/>) : (<Clock size={20}/>)}
              </div>
              <div className={styles.content}>
                <div className={styles.titleRow}>
                  <strong>{option.name}</strong>
                  <span className={styles.price}>
                    {option.price === 0 ? "FREE" : `₹${option.price}`}
                  </span>
                </div>
                <p>{option.description}</p>
                <span className={styles.estimated}>
                  <Clock size={14}/>
                  {option.estimatedTime}
                </span>
              </div>
              <div className={`${styles.radio} ${isSelected ? styles.radioSelected : ""}`}>
                {isSelected && <Check size={13}/>}
              </div>
            </button>);
        })}
      </div>
    </section>);
};
export default DeliveryMethod;
