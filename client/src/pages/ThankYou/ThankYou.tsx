import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import { useOrderDetail } from "../../features/orders/hooks/useOrders";
import { formatOrderRef } from "../../features/orders/api/order.api";
import { routes } from "../../routes/routes";
import { storefrontNavigate } from "../../routes/routes";
import styles from "./ThankYou.module.css";

interface ThankYouLocationState {
    amount?: number;
    paymentStatus?: string;
    paymentMethod?: "cod" | "online";
}

const ThankYou = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { orderId } = useParams<{ orderId: string }>();
    const { tenantSlug, tenant } = useStorefrontTenant();
    const { formatPrice } = useFormatStorePrice();
    const state = (location.state || {}) as ThankYouLocationState;

    // Checkout only passes the id; fetch the order for its readable reference.
    const { data: order } = useOrderDetail(orderId || "");
    const orderLabel = order
        ? formatOrderRef(order)
        : orderId
          ? `#${orderId.slice(-8).toUpperCase()}`
          : null;
    const amountLabel =
        typeof state.amount === "number" && Number.isFinite(state.amount)
            ? formatPrice(state.amount)
            : null;
    const paymentLabel =
        state.paymentMethod === "cod"
            ? "Cash on Delivery"
            : state.paymentMethod === "online"
              ? "Paid online"
              : state.paymentStatus
                ? state.paymentStatus
                : null;

    const storeHome = tenantSlug ? routes.home(tenantSlug) : "/";
    const orderDetailPath =
        tenantSlug && orderId ? routes.orderDetail(tenantSlug, orderId) : null;

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.iconWrap} aria-hidden="true">
                        <CheckCircle2 size={36} strokeWidth={2} />
                    </div>
                    <p className={styles.eyebrow}>Order confirmed</p>
                    <h1 className={styles.title}>Thank you for your order</h1>
                    <p className={styles.message}>
                        {tenant?.name
                            ? `Your order at ${tenant.name} has been placed successfully.`
                            : "Your order has been placed successfully."}{" "}
                        We’ll keep you updated as it moves through fulfillment.
                    </p>

                    {(orderLabel || amountLabel || paymentLabel) && (
                        <div className={styles.meta}>
                            {orderLabel && (
                                <div className={styles.metaRow}>
                                    <span className={styles.metaLabel}>Order</span>
                                    <span className={styles.metaValue}>{orderLabel}</span>
                                </div>
                            )}
                            {amountLabel && (
                                <div className={styles.metaRow}>
                                    <span className={styles.metaLabel}>Total</span>
                                    <span className={styles.metaValue}>{amountLabel}</span>
                                </div>
                            )}
                            {paymentLabel && (
                                <div className={styles.metaRow}>
                                    <span className={styles.metaLabel}>Payment</span>
                                    <span className={styles.metaValue}>{paymentLabel}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => storefrontNavigate(navigate, storeHome)}
                        >
                            Continue shopping
                        </button>
                        {orderDetailPath && (
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => storefrontNavigate(navigate, orderDetailPath)}
                            >
                                View order
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ThankYou;
