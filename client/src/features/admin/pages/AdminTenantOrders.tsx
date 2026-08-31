import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ChevronRight,
    Eye,
    Package,
    ShoppingBag,
    Truck,
} from "lucide-react";
import ProductImage from "../../../components/ProductImage";
import { useAdminOrders } from "../../orders/hooks/useOrders";
import { useTenantByTenantId } from "../hooks/useTenants";
import {
    formatOrderAmount,
    formatOrderDate,
    orderStatusLabel,
} from "../../orders/api/order.api";
import type { Order, OrderStatus } from "../../orders/types/order.types";
import styles from "../styles/AdminTenantOrders.module.css";

const STATUS_FILTERS: Array<{ id: "all" | OrderStatus; label: string }> = [
    { id: "all", label: "All" },
    { id: "confirmed", label: "Confirmed" },
    { id: "processing", label: "Processing" },
    { id: "shipped", label: "Shipped" },
    { id: "delivered", label: "Delivered" },
    { id: "cancelled", label: "Cancelled" },
];

const nextActions: Partial<Record<OrderStatus, Array<{ status: OrderStatus; label: string; primary?: boolean }>>> = {
    confirmed: [
        { status: "processing", label: "Process", primary: true },
        { status: "shipped", label: "Ship" },
        { status: "cancelled", label: "Cancel" },
    ],
    processing: [
        { status: "shipped", label: "Mark shipped", primary: true },
        { status: "cancelled", label: "Cancel" },
    ],
    shipped: [
        { status: "delivered", label: "Mark delivered", primary: true },
        { status: "cancelled", label: "Cancel" },
    ],
};

export default function AdminTenantOrders() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<"all" | OrderStatus>("all");
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const { data: tenant } = useTenantByTenantId(tenantId);
    const {
        data: orders = [],
        isLoading,
        isError,
        updateOrderStatus,
        isUpdatingStatus,
    } = useAdminOrders(tenantId);

    const stats = useMemo(
        () => ({
            total: orders.length,
            processing: orders.filter((order) => order.orderStatus === "processing").length,
            shipped: orders.filter((order) => order.orderStatus === "shipped").length,
            delivered: orders.filter((order) => order.orderStatus === "delivered").length,
        }),
        [orders],
    );

    const filterCounts = useMemo(() => {
        const counts: Record<string, number> = { all: orders.length };
        for (const order of orders) {
            const status = order.orderStatus || "confirmed";
            counts[status] = (counts[status] || 0) + 1;
        }
        return counts;
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (filter === "all") {
            return orders;
        }
        return orders.filter((order) => order.orderStatus === filter);
    }, [filter, orders]);

    const handleStatusUpdate = async (
        event: React.MouseEvent,
        order: Order,
        orderStatus: OrderStatus,
    ) => {
        event.stopPropagation();
        if (orderStatus === "cancelled") {
            const confirmed = window.confirm(
                `Cancel order #${order.orderId.slice(-8).toUpperCase()}? Stock will be restored.`,
            );
            if (!confirmed) {
                return;
            }
        }
        setUpdatingOrderId(order.orderId);
        try {
            await updateOrderStatus({ orderId: order.orderId, orderStatus });
        } finally {
            setUpdatingOrderId(null);
        }
    };

    const openOrder = (orderId: string) => {
        navigate(`/admin/tenants/${tenantId}/orders/${orderId}`);
    };

    if (isLoading) {
        return <div className={styles.state}>Loading orders...</div>;
    }

    if (isError) {
        return <div className={styles.state}>Failed to load orders.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                    >
                        ← Back to store
                    </button>
                    <span className={styles.eyebrow}>ORDERS</span>
                    <h1>{tenant?.name || "Store"} orders</h1>
                    <p>View, fulfill, and cancel customer orders.</p>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <ShoppingBag size={18} />
                    </div>
                    <div>
                        <span>Total orders</span>
                        <strong>{stats.total}</strong>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Package size={18} />
                    </div>
                    <div>
                        <span>Processing</span>
                        <strong>{stats.processing}</strong>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Truck size={18} />
                    </div>
                    <div>
                        <span>Shipped</span>
                        <strong>{stats.shipped}</strong>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIcon} ${styles.statIconSuccess}`}>
                        <ChevronRight size={18} />
                    </div>
                    <div>
                        <span>Delivered</span>
                        <strong>{stats.delivered}</strong>
                    </div>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.filters}>
                    {STATUS_FILTERS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`${styles.filterButton} ${filter === item.id ? styles.filterActive : ""}`}
                            onClick={() => setFilter(item.id)}
                        >
                            {item.label}
                            <span className={styles.filterCount}>
                                {filterCounts[item.id] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
                <span className={styles.resultCount}>
                    {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"}
                </span>
            </div>

            {filteredOrders.length === 0 ? (
                <div className={styles.empty}>
                    <Package size={32} />
                    <h3>No orders in this view</h3>
                    <p>Orders will appear here once customers place them.</p>
                </div>
            ) : (
                <div className={styles.tableCard}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => {
                                const status = order.orderStatus || "confirmed";
                                const actions = nextActions[status] || [];
                                const isUpdating =
                                    isUpdatingStatus && updatingOrderId === order.orderId;
                                const leadItem = order.items?.[0];

                                return (
                                    <tr
                                        key={order.orderId}
                                        className={styles.row}
                                        onClick={() => openOrder(order.orderId)}
                                    >
                                        <td>
                                            <strong className={styles.orderId}>
                                                #{order.orderId.slice(-8).toUpperCase()}
                                            </strong>
                                            <span>{formatOrderDate(order.createdAt)}</span>
                                        </td>
                                        <td>
                                            <div className={styles.customerCell}>
                                                <span className={styles.avatar}>
                                                    {(order.customer?.name || "C").charAt(0).toUpperCase()}
                                                </span>
                                                <div>
                                                    <strong>{order.customer?.name || "Customer"}</strong>
                                                    <span>{order.customer?.email || "-"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.itemPreview}>
                                                <div className={styles.itemThumb}>
                                                    <ProductImage
                                                        src={leadItem?.image}
                                                        alt=""
                                                        placeholder={<Package size={14} />}
                                                    />
                                                </div>
                                                <div>
                                                    <strong>{order.items?.length ?? 0} items</strong>
                                                    <span>{leadItem?.name || "-"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <strong className={styles.amount}>
                                                {formatOrderAmount(order.totalAmount)}
                                            </strong>
                                            <span className={styles.paidBadge}>
                                                {order.paymentStatus || "paid"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`${styles.status} ${styles[`status_${status}`]}`}>
                                                {orderStatusLabel[status]}
                                            </span>
                                        </td>
                                        <td onClick={(event) => event.stopPropagation()}>
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
                                                        onClick={(event) =>
                                                            handleStatusUpdate(event, order, action.status)
                                                        }
                                                    >
                                                        {isUpdating ? "..." : action.label}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    className={styles.viewButton}
                                                    onClick={() => openOrder(order.orderId)}
                                                >
                                                    <Eye size={14} />
                                                    View
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
