import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
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
import {
    createDelhiveryShipment,
    downloadDelhiveryPackingSlip,
    requestDelhiveryPickup,
    trackDelhiveryAwb,
} from "../api/delhivery.api";
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

function errMsg(err: unknown, fallback: string) {
    if (err instanceof Error && err.message && !axios.isAxiosError(err)) {
        return err.message;
    }
    if (!axios.isAxiosError(err)) return fallback;
    if (err.response?.data instanceof Blob) {
        return fallback;
    }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
        return String((detail as { message?: string }).message || fallback);
    }
    return err.message || fallback;
}

export default function AdminOrderDetail() {
    const { tenantId = "", orderId = "" } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isShipping, setIsShipping] = useState(false);
    const [isPickup, setIsPickup] = useState(false);
    const [shipMessage, setShipMessage] = useState("");
    const [trackInfo, setTrackInfo] = useState("");
    const [trackHistory, setTrackHistory] = useState<
        Array<{ status?: string; location?: string; at?: string }>
    >([]);
    const [isTracking, setIsTracking] = useState(false);
    const [isLabel, setIsLabel] = useState(false);
    const { data: order, isLoading, isError } = useAdminOrderDetail(orderId, tenantId);
    const { updateOrderStatus } = useAdminOrders(tenantId);

    const status = order?.orderStatus || "confirmed";

    const actions = useMemo(() => {
        if (!order?.orderStatus) return [];
        return nextActions[order.orderStatus] || [];
    }, [order?.orderStatus]);

    const activeStepIndex = useMemo(() => {
        if (status === "cancelled") return -1;
        return STATUS_STEPS.indexOf(status);
    }, [status]);

    const handleStatusUpdate = async (orderStatus: OrderStatus) => {
        if (!order) return;
        if (orderStatus === "cancelled") {
            if (!window.confirm("Cancel this order? Stock will be restored.")) return;
        }
        setIsUpdating(true);
        try {
            await updateOrderStatus({ orderId: order.orderId, orderStatus });
        } finally {
            setIsUpdating(false);
        }
    };

    const handleShip = async () => {
        if (!order) return;
        setIsShipping(true);
        setShipMessage("");
        try {
            const result = await createDelhiveryShipment(tenantId, order.orderId);
            setShipMessage(
                `${result.message || "Shipped"} · AWB ${result.data.awb}`,
            );
            await queryClient.invalidateQueries({
                queryKey: ["orders", "admin", "detail", tenantId, orderId],
            });
        } catch (err) {
            setShipMessage(errMsg(err, "Could not create Delhivery shipment."));
        } finally {
            setIsShipping(false);
        }
    };

    const handleTrack = async () => {
        const awb = order?.courier?.waybill;
        if (!awb) return;
        setIsTracking(true);
        try {
            const data = await trackDelhiveryAwb(tenantId, awb);
            setTrackInfo(
                [data.status || "In transit", data.location].filter(Boolean).join(" · "),
            );
            setTrackHistory(data.history || []);
        } catch (err) {
            setTrackInfo(errMsg(err, "Tracking failed."));
        } finally {
            setIsTracking(false);
        }
    };

    const handlePackingSlip = async () => {
        const awb = order?.courier?.waybill;
        if (!awb) return;
        setIsLabel(true);
        setShipMessage("");
        try {
            const blob = await downloadDelhiveryPackingSlip(tenantId, awb);
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (err) {
            setShipMessage(errMsg(err, "Could not open packing slip."));
        } finally {
            setIsLabel(false);
        }
    };

    useEffect(() => {
        if (!order?.courier?.waybill) {
            setTrackHistory([]);
            return;
        }
        void handleTrack();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.courier?.waybill, tenantId]);

    const handlePickup = async () => {
        setIsPickup(true);
        setShipMessage("");
        try {
            const result = await requestDelhiveryPickup(tenantId, {});
            setShipMessage(
                `${result.message || "Pickup requested"}`
                + (result.data.pickupId ? ` · pickup ${result.data.pickupId}` : "")
                + (result.data.expectedPackageCount
                    ? ` · ${result.data.expectedPackageCount} package(s)`
                    : ""),
            );
        } catch (err) {
            setShipMessage(errMsg(err, "Pickup request failed."));
        } finally {
            setIsPickup(false);
        }
    };

    if (isLoading) return <PageLoader message="Loading order..." />;

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

    const canShip =
        !order.courier?.waybill &&
        status !== "cancelled" &&
        status !== "delivered";

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

            <section className={styles.courierCard}>
                <div className={styles.courierHeader}>
                    <div>
                        <span className={styles.eyebrow}>DELHIVERY</span>
                        <h2>Shipment</h2>
                    </div>
                    <div className={styles.courierActions}>
                        {canShip ? (
                            <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={isShipping}
                                onClick={handleShip}
                            >
                                {isShipping ? "Creating..." : "Ship with Delhivery"}
                            </button>
                        ) : null}
                        {order.courier?.waybill ? (
                            <button
                                type="button"
                                className={styles.actionButton}
                                onClick={handleTrack}
                                disabled={isTracking}
                            >
                                {isTracking ? "Refreshing..." : "Refresh tracking"}
                            </button>
                        ) : null}
                        {order.courier?.waybill ? (
                            <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={isPickup}
                                onClick={handlePickup}
                            >
                                {isPickup ? "Requesting..." : "Request pickup"}
                            </button>
                        ) : null}
                        {order.courier?.trackingUrl ? (
                            <a
                                className={styles.trackLink}
                                href={order.courier.trackingUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Open tracking
                            </a>
                        ) : null}
                        {order.courier?.waybill ? (
                            <button
                                type="button"
                                className={styles.trackLink}
                                disabled={isLabel}
                                onClick={() => void handlePackingSlip()}
                            >
                                {isLabel ? "Opening slip..." : "Packing slip"}
                            </button>
                        ) : null}
                    </div>
                </div>
                {order.courier?.waybill ? (
                    <p className={styles.courierMeta}>
                        AWB <strong>{order.courier.waybill}</strong>
                        {order.courier.trackingStatus
                            ? ` · ${order.courier.trackingStatus}`
                            : ""}
                    </p>
                ) : (
                    <p className={styles.courierMeta}>
                        No tracking yet. Use Ship with Delhivery to create an AWB.
                        Marking an order as shipped from the list does not add tracking.
                    </p>
                )}
                {trackInfo ? <p className={styles.courierMessage}>{trackInfo}</p> : null}
                {trackHistory.length > 0 ? (
                    <ol className={styles.trackHistory}>
                        {trackHistory.map((event, index) => (
                            <li key={`${event.at || ""}-${index}`}>
                                <strong>{event.status || "Update"}</strong>
                                <span>
                                    {[event.location, event.at].filter(Boolean).join(" · ")}
                                </span>
                            </li>
                        ))}
                    </ol>
                ) : null}
                {shipMessage ? <p className={styles.courierMessage}>{shipMessage}</p> : null}
            </section>

            <OrderDetailContent
                order={order}
                showCustomer
                showPaymentIds
                variant="admin"
            />
        </div>
    );
}
