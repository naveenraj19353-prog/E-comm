import { useState } from "react";
import { Truck, PackageCheck, RotateCcw, CreditCard, MapPin } from "lucide-react";
import axios from "axios";
import styles from "./ProductDetails.module.css";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import {
    checkDeliveryPincode,
    type ShippingOptionQuote,
} from "../../features/shipping/api/pincode.api";
import { BusyLabel } from "../../components/Loading";

const ProductDelivery = () => {
    const { tenantId } = useStorefrontTenant();
    const { formatPrice } = useFormatStorePrice();
    const [pincode, setPincode] = useState("");
    const [pincodeMessage, setPincodeMessage] = useState("");
    const [pincodeOk, setPincodeOk] = useState(false);
    const [codAvailable, setCodAvailable] = useState<boolean | null>(null);
    const [shippingOptions, setShippingOptions] = useState<ShippingOptionQuote[]>([]);
    const [estimatedDays, setEstimatedDays] = useState<number | null>(null);
    const [checking, setChecking] = useState(false);

    const resetQuote = () => {
        setPincodeMessage("");
        setPincodeOk(false);
        setCodAvailable(null);
        setShippingOptions([]);
        setEstimatedDays(null);
    };

    const handlePincodeCheck = async () => {
        const cleanPincode = pincode.trim();
        if (!/^[1-9][0-9]{5}$/.test(cleanPincode)) {
            setPincodeOk(false);
            setCodAvailable(null);
            setShippingOptions([]);
            setEstimatedDays(null);
            setPincodeMessage("Please enter a valid 6-digit pincode.");
            return;
        }
        if (!tenantId) {
            setPincodeOk(false);
            setPincodeMessage("Store not found.");
            return;
        }
        try {
            setChecking(true);
            const result = await checkDeliveryPincode(tenantId, cleanPincode);
            setPincodeOk(Boolean(result.serviceable));
            setCodAvailable(result.serviceable ? Boolean(result.cod) : false);
            setShippingOptions(
                result.serviceable ? result.shippingOptions || [] : [],
            );
            setEstimatedDays(
                result.serviceable && result.estimatedDays
                    ? result.estimatedDays
                    : result.shippingOptions?.find((option) => option.estimatedDays)
                          ?.estimatedDays || null,
            );
            setPincodeMessage(result.message);
        } catch (error: unknown) {
            setPincodeOk(false);
            setCodAvailable(null);
            setShippingOptions([]);
            setEstimatedDays(null);
            if (axios.isAxiosError(error)) {
                const detail = error.response?.data?.detail;
                setPincodeMessage(
                    typeof detail === "string"
                        ? detail
                        : "Unable to check delivery for this pincode.",
                );
            } else {
                setPincodeMessage("Unable to check delivery for this pincode.");
            }
        } finally {
            setChecking(false);
        }
    };

    const chargesDescription = checking
        ? "Checking delivery charges..."
        : shippingOptions.length
          ? shippingOptions
                .map((option) => `${formatPrice(option.shippingCost)} ${option.mode}`)
                .join(" · ")
          : pincodeOk
            ? "Charges will be confirmed at checkout"
            : "Enter a pincode to see Delhivery charges";

    const etaDescription = checking
        ? "Checking delivery time..."
        : estimatedDays
          ? `Delivery in ${estimatedDays} business days`
          : pincodeOk
            ? "Delivery time will be confirmed at checkout"
            : "Enter a pincode to see partner delivery time";

    return (
        <section className={styles.deliverySection}>
            <div className={styles.deliveryHeader}>
                <span className={styles.sectionEyebrow}>DELIVERY & SERVICES</span>
                <h3>Check delivery availability</h3>
            </div>
            <div className={styles.pincodeInputWrapper}>
                <MapPin size={17} />
                <input
                    type="text"
                    value={pincode}
                    onChange={(event) => {
                        setPincode(event.target.value.replace(/\D/g, ""));
                        resetQuote();
                    }}
                    placeholder="Enter pincode"
                    maxLength={6}
                    inputMode="numeric"
                    aria-label="Delivery pincode"
                    disabled={checking}
                />
                <button
                    type="button"
                    onClick={handlePincodeCheck}
                    disabled={checking}
                    aria-busy={checking}
                >
                    <BusyLabel busy={checking} busyText="Checking">
                        Check
                    </BusyLabel>
                </button>
            </div>
            {pincodeMessage ? (
                <p className={pincodeOk ? styles.pincodeSuccess : styles.pincodeError}>
                    {pincodeMessage}
                </p>
            ) : null}
            {shippingOptions.length ? (
                <ul className={styles.shippingRates}>
                    {shippingOptions.map((option) => (
                        <li key={option.id}>
                            <span>{option.mode}</span>
                            <strong>{formatPrice(option.shippingCost)}</strong>
                            {option.estimatedDays ? (
                                <em>{option.estimatedDays} days</em>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
            <div className={styles.deliveryInfo}>
                <DeliveryItem
                    icon={<Truck size={18} />}
                    title="Delivery charges"
                    description={chargesDescription}
                />
                <DeliveryItem
                    icon={<PackageCheck size={18} />}
                    title="Estimated Delivery"
                    description={etaDescription}
                />
                <DeliveryItem
                    icon={<RotateCcw size={18} />}
                    title="Easy Returns"
                    description="2 days return available"
                />
                <DeliveryItem
                    icon={<CreditCard size={18} />}
                    title="Cash on Delivery"
                    description={
                        checking
                            ? "Checking COD availability..."
                            : codAvailable === null
                              ? "Enter a pincode to check COD availability"
                              : codAvailable
                                ? "Available for this pincode"
                                : "Not available for this pincode"
                    }
                />
            </div>
        </section>
    );
};

interface DeliveryItemProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

const DeliveryItem = ({ icon, title, description }: DeliveryItemProps) => {
    return (
        <div className={styles.deliveryItem}>
            <div className={styles.deliveryIcon}>{icon}</div>
            <div>
                <strong>{title}</strong>
                <p>{description}</p>
            </div>
        </div>
    );
};

export default ProductDelivery;
