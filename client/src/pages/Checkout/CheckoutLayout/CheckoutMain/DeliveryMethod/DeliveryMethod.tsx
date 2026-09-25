import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Truck } from "lucide-react";
import type { DeliveryMethodType } from "../../../../../features/checkout/api/checkout.api";
import { useFormatStorePrice } from "../../../../../features/tenant/useFormatStorePrice";
import styles from "./DeliveryMethod.module.css";

export interface DeliveryOption {
    id: DeliveryMethodType;
    name: string;
    description: string;
    estimatedTime: string;
    price: number;
    originalPrice?: number | null;
    freeDelivery?: boolean;
}

interface DeliveryMethodProps {
    selectedMethod?: DeliveryMethodType;
    shippingOptions?: Array<{
        id: DeliveryMethodType;
        mode: string;
        estimatedDays?: number | null;
        shippingCost: number;
        originalShippingCost?: number | null;
        freeDelivery?: boolean;
    }>;
    shippingProvider?: string | null;
    shippingMessage?: string | null;
    onDeliveryChange?: (option: DeliveryOption) => void;
}

const DeliveryMethod = ({
    selectedMethod = "standard",
    shippingOptions,
    shippingProvider,
    shippingMessage,
    onDeliveryChange,
}: DeliveryMethodProps) => {
    const { formatPrice } = useFormatStorePrice();
    const [selectedId, setSelectedId] = useState<DeliveryMethodType>(selectedMethod);

    useEffect(() => {
        setSelectedId(selectedMethod);
    }, [selectedMethod]);

    const deliveryOptions = useMemo((): DeliveryOption[] => {
        if (!shippingOptions?.length) {
            return [];
        }
        return shippingOptions.map((opt) => ({
            id: opt.id,
            name: opt.mode === "Express" ? "Express Delivery" : "Standard Delivery",
            description:
                opt.id === "express"
                    ? "Faster partner express service."
                    : "Partner surface delivery.",
            estimatedTime: opt.estimatedDays
                ? `${opt.estimatedDays} business days`
                : "Time as quoted by the delivery partner",
            price: opt.shippingCost,
            originalPrice: opt.originalShippingCost,
            freeDelivery: opt.freeDelivery,
        }));
    }, [shippingOptions]);

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
                    <p>
                        {shippingProvider
                            ? "Live partner rates for your delivery pincode."
                            : shippingMessage ||
                              "Connect a delivery partner to quote shipping charges."}
                    </p>
                </div>
            </div>
            {deliveryOptions.length ? (
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
                                            {option.freeDelivery && option.originalPrice ? (
                                                <s className={styles.originalPrice}>{formatPrice(option.originalPrice)}</s>
                                            ) : null}
                                            {option.freeDelivery && option.price === 0
                                                ? "Free"
                                                : formatPrice(option.price)}
                                        </span>
                                    </div>
                                    <p>
                                        {option.description}
                                        {option.freeDelivery && option.price > 0
                                            ? " Free delivery applied; the COD handling fee still applies."
                                            : ""}
                                    </p>
                                    <span className={styles.estimated}>
                                        <Check size={14} /> {option.estimatedTime}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className={styles.empty}>
                    {shippingMessage ||
                        "Delivery charges will appear once a partner quote is available."}
                </p>
            )}
        </section>
    );
};

export default DeliveryMethod;
