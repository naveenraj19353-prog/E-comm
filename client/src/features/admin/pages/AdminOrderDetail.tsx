import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    useAdminOrderDetail,
    useAdminOrders,
} from "../../orders/hooks/useOrders";
import OrderDetailContent from "../../orders/components/OrderDetailContent";
import {
    formatOrderAmount,
    formatOrderDate,
    orderStatusLabel,
} from "../../orders/api/order.api";
import type { OrderStatus } from "../../orders/types/order.types";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/AdminOrderDetail.module.css";

const STATUS_STEPS: OrderStatus[] = [
    "confirmed",
    "processing",
    "shipped",
    "delivered",
];

const nextActions: Partial<
    Record<OrderStatus, Array<{ status: OrderStatus; label: string; primary?: boolean }>>
> = {
    confirmed: [
        { status: "processing", label: "Mark processing", primary: true },
        { status: "shipped", label: "Mark shipped" },
        { status: "cancelled", label: "Cancel order" },
    ],
    processing: [
        { status: "shipped", label: "Mark shipped", primary: true },
        { status: "cancelled", label: "Cancel order" },
    ],
    shipped: [
        { status: "delivered", label: "Mark delivered", primary: true },
        { status: "cancelled", label: "Cancel order" },
    ],
};

export default function AdminOrderDetail() {
    const { tenantId = "", orderId = "" } = useParams();
    const navigate = useNavigate();
    const [isUpdating, setIsUpdating] = useState(false);
    const { data: order, isLoading, isError } = useAdminOrderDetail(orderId, tenantId);
    const { updateOrderStatus } = useAdminOrders(tenantId);

    const status = order?.orderStatus || "confirmed";

    const actions = useMemo(() => {
        if (!order?.orderStatus) {
            return [];
        }
        return nextActions[order.orderStatus] || [];
    }, [order?.orderStatus]);

    const activeStepIndex = useMemo(() => {
        if (status === "cancelled") {
            return -1;
        }
        return STATUS_STEPS.indexOf(status);
    }, [status]);

    const handleStatusUpdate = async (orderStatus: OrderStatus) => {
        if (!order) {
            return;
        }
        if (orderStatus === "cancelled") {
            const confirmed = window.confirm("Cancel this order? Stock will be restored.");
            if (!confirmed) {
                return;
            }
        }
        setIsUpdating(true);
        try {
            await updateOrderStatus({ orderId: order.orderId, orderStatus });
        } finally {
            setIsUpdating(false);
        }
    };

    if (isLoading) {
        return <PageLoader message="Loading order..." />;
    }

    if (isError || !order) {
        return (
            <div className={styles.state}>
                Order not found.
                <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => navigate(`/admin/tenants/${tenantId}/orders`)}
                >
                    Back to orders
                </button>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate(`/admin/tenants/${tenantId}/orders`)}
            >
                ← Back to orders
            </button>

            <div className={styles.hero}>
                <div className={styles.heroMain}>
                    <span className={styles.eyebrow}>ORDER DETAILS</span>
                    <h1>Order #{order.orderId.slice(-8).toUpperCase()}</h1>
                    <div className={styles.heroMeta}>
                        <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                            {orderStatusLabel[status]}
                        </span>
                        <span className={styles.metaDot}>·</span>
                        <span className={styles.paidLabel}>{order.paymentStatus || "paid"}</span>
                        <span className={styles.metaDot}>·</span>
                        <span>{formatOrderDate(order.createdAt)}</span>
                    </div>
                </div>
                <div className={styles.heroAside}>
                    <span className={styles.totalLabel}>Total paid</span>
                    <strong className={styles.totalAmount}>
                        {formatOrderAmount(order.totalAmount)}
                    </strong>
                    {actions.length > 0 && (
                        <div className={styles.actions}>
                            {actions.map((action) => (
                                <button
                                    key={action.status}
                                    type="button"
                                    className={
                                        action.status === "cancelled"
                                            ? styles.cancelButton
                                            : action.primary
                                                ? styles.primaryButton
                                                : styles.actionButton
                                    }
                                    disabled={isUpdating}
                                    onClick={() => handleStatusUpdate(action.status)}
                                >
                                    {isUpdating ? "Saving..." : action.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {status !== "cancelled" && (
                <div className={styles.timeline}>
                    {STATUS_STEPS.map((step, index) => {
                        const isComplete = activeStepIndex >= index;
                        const isCurrent = activeStepIndex === index;
                        return (
                            <div
                                key={step}
                                className={`${styles.step} ${isComplete ? styles.stepComplete : ""} ${isCurrent ? styles.stepCurrent : ""}`}
                            >
                                <div className={styles.stepDot} />
                                <span>{orderStatusLabel[step]}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {status === "cancelled" && (
                <div className={styles.cancelledBanner}>
                    This order was cancelled. Stock has been restored.
                </div>
            )}

            <OrderDetailContent
                order={order}
                showCustomer
                showPaymentIds
                variant="admin"
            />
        </div>
    );
}
