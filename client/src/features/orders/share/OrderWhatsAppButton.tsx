import { FaWhatsapp } from "react-icons/fa";
import {
    sendOrderConfirmationWhatsApp,
    type OrderWhatsAppInput,
} from "./orderWhatsAppShare";
import styles from "./OrderWhatsAppButton.module.css";

interface OrderWhatsAppButtonProps {
    order: OrderWhatsAppInput;
    className?: string;
    label?: string;
}

const OrderWhatsAppButton = ({
    order,
    className = "",
    label = "Send on WhatsApp",
}: OrderWhatsAppButtonProps) => {
    return (
        <button
            type="button"
            className={`${styles.button} ${className}`.trim()}
            onClick={() => sendOrderConfirmationWhatsApp(order)}
        >
            <FaWhatsapp size={18} aria-hidden="true" />
            {label}
        </button>
    );
};

export default OrderWhatsAppButton;
