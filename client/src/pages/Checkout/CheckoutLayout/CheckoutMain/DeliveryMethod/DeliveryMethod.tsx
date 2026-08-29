import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Truck } from "lucide-react";
import {
    EXPRESS_DELIVERY_FEE,
    FREE_SHIPPING_THRESHOLD,
    STANDARD_SHIPPING_FEE,
    type DeliveryMethodType,
} from "../../../../../features/checkout/api/checkout.api";
import styles from "./DeliveryMethod.module.css";

export interface DeliveryOption {
    id: DeliveryMethodType;
    name: string;
    description: string;
    estimatedTime: string;
    price: number;
}

interface DeliveryMethodProps {
    subtotal?: number;
    selectedMethod?: DeliveryMethodType;
    onDeliveryChange?: (option: DeliveryOption) => void;
}

const DeliveryMethod = ({
    subtotal = 0,
    selectedMethod = "standard",
    onDeliveryChange,
}: DeliveryMethodProps) => {
    const [selectedId, setSelectedId] = useState<DeliveryMethodType>(selectedMethod);

    useEffect(() => {
        setSelectedId(selectedMethod);
    }, [selectedMethod]);

    const deliveryOptions = useMemo((): DeliveryOption[] => {
        const baseShipping =
            subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
        const standardDescription =
            baseShipping === 0
                ? "Free delivery on your order."
                : `₹${STANDARD_SHIPPING_FEE} delivery fee applies below ₹${FREE_SHIPPING_THRESHOLD.toLocaleString("en-IN")}.`;

        return [
            {
                id: "standard",
                name: "Standard Delivery",
                description: standardDescription,
                estimatedTime: "3–5 business days",
                price: baseShipping,
            },
            {
                id: "express",
                name: "Express Delivery",
                description: `Get your order faster for ₹${EXPRESS_DELIVERY_FEE} extra.`,
                estimatedTime: "1–2 business days",
                price: baseShipping + EXPRESS_DELIVERY_FEE,
            },
        ];
    }, [subtotal]);

    const handleSelect = (option: DeliveryOption) => {
        setSelectedId(option.id);
        onDeliveryChange?.(option);
    };

    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>DELIVERY</span>
                    <h2>Choose delivery method</h2>
                    <p>Select how you would like to receive your order.</p>
                </div>
            </div>
            <div className={styles.options}>
                {deliveryOptions.map((option) => {
                    const isSelected = selectedId === option.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                            onClick={() => handleSelect(option)}
                        >
                            <div className={styles.icon}>
                                {option.id === "express" ? (
                                    <Truck size={20} />
                                ) : (
                                    <Clock size={20} />
                                )}
                            </div>
                            <div className={styles.content}>
                                <div className={styles.titleRow}>
                                    <strong>{option.name}</strong>
                                    <span className={styles.price}>
                                        {option.price === 0
                                            ? "FREE"
                                            : `₹${option.price.toLocaleString("en-IN")}`}
                                    </span>
                                </div>
                                <p>{option.description}</p>
                                <span className={styles.estimated}>
                                    <Clock size={14} />
                                    {option.estimatedTime}
                                </span>
                            </div>
                            <div
                                className={`${styles.radio} ${isSelected ? styles.radioSelected : ""}`}
                            >
                                {isSelected && <Check size={13} />}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};

export default DeliveryMethod;
