import { ArrowRight } from "lucide-react";
import styles from "./Cart.module.css";
import { useNavigate } from "react-router-dom";
import { routes, storefrontNavigate } from "../../routes/routes";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";

interface CartSummaryProps {
    cartCount: number;
    grandTotal: number;
    tenantId: string;
    mode?: "checkout" | "summary";
}

const CartSummary = ({
    cartCount,
    grandTotal,
    tenantId,
    mode = "checkout",
}: CartSummaryProps) => {
    const navigate = useNavigate();
    const { formatPrice } = useFormatStorePrice();
    const isSummaryOnly = mode === "summary";

    return (
        <aside className={styles.summary}>
            <div className={styles.summaryHeader}>
                <h2>Order Summary</h2>
                <span>
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
            </div>
            <div className={styles.summaryRows}>
                <div className={styles.summaryRow}>
                    <span>Subtotal</span>
                    <span>{formatPrice(grandTotal)}</span>
                </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.total}>
                <div>
                    <span>Total</span>
                </div>
                <strong>{formatPrice(grandTotal)}</strong>
            </div>
            {!isSummaryOnly ? (
                <button
                    type="button"
                    className={styles.checkout}
                    onClick={() =>
                        storefrontNavigate(navigate, routes.checkout(tenantId))
                    }
                >
                    Proceed To Checkout
                    <ArrowRight size={18} />
                </button>
            ) : null}
            <div className={styles.secure}>
                <span className={styles.secureDot} />
                {isSummaryOnly
                    ? "Your order is visible at the counter. Pay when ready."
                    : "Secure checkout"}
            </div>
        </aside>
    );
};

export default CartSummary;
