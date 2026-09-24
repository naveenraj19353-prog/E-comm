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
    ADMIN_ORDERS_PAGE_SIZE,
    formatOrderAmount,
    formatOrderDate,
    formatOrderRef,
    orderStatusLabel,
} from "../../orders/api/order.api";
import type { Order, OrderStatus } from "../../orders/types/order.types";
import styles from "../styles/AdminTenantOrders.module.css";
import paymentStyles from "../styles/AdminTenantPayments.module.css";

const PAGE_SIZE = ADMIN_ORDERS_PAGE_SIZE;

const STATUS_FILTERS: Array<{ id: "all" | OrderStatus; label: string }> = [
    { id: "all", label: "All" },
    { id: "confirmed", label: "Confirmed" },
    { id: "processing", label: "Processing" },
    { id: "shipped", label: "Shipped" },
    { id: "delivered", label: "Delivered" },
        { id: "cancelled", label: "Cancelled" },
        { id: "return_requested", label: "Return requested" },
        { id: "return_approved", label: "Return approved" },
        { id: "returned", label: "Returned" },
        { id: "refunded", label: "Refunded" },
        { id: "partially_returned", label: "Partly returned" },
        { id: "partially_refunded", label: "Partly refunded" },
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
    const [page, setPage] = useState(1);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const { data: tenant } = useTenantByTenantId(tenantId);
    const {
        data: ordersPage,
        isLoading,
        isError,
        isFetching,
        updateOrderStatus,
        isUpdatingStatus,
    } = useAdminOrders(tenantId, { page, pageSize: PAGE_SIZE, status: filter });

    const filteredOrders = useMemo(() => ordersPage?.orders ?? [], [ordersPage]);
    const filterCounts = useMemo(() => ordersPage?.statusCounts ?? {}, [ordersPage]);
    const totalInView = ordersPage?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalInView / PAGE_SIZE));

    const stats = {
        total: filterCounts.all ?? 0,
        processing: filterCounts.processing ?? 0,
        shipped: filterCounts.shipped ?? 0,
        delivered: filterCounts.delivered ?? 0,
    };

    const changeFilter = (next: "all" | OrderStatus) => {
        setFilter(next);
        setPage(1);
    };

    const handleStatusUpdate = async (
        event: React.MouseEvent,
        order: Order,
        orderStatus: OrderStatus,
    ) => {
        event.stopPropagation();
        if (orderStatus === "cancelled") {
            const confirmed = window.confirm(
                `Cancel order ${formatOrderRef(order)}? Stock will be restored.`,
            );
            if (!confirmed) {
                return;
            }
        }
        setUpdatingOrderId(order.orderId);
        try {
            await updateOrderStatus({ orderId: order.orderId, orderStatus });
            // The order just left this filtered view; if it was the only one
            // on this page, step back instead of showing an empty page.
            if (filter !== "all" && filteredOrders.length === 1 && page > 1) {
                setPage(page - 1);
            }
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
                            onClick={() => changeFilter(item.id)}
                        >
                            {item.label}
                            <span className={styles.filterCount}>
                                {filterCounts[item.id] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
                <span className={styles.resultCount}>
                    {totalInView} order{totalInView === 1 ? "" : "s"}
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
                                <th>Tracking</th>
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
                                        <td className={styles.cellOrder}>
                                            <strong className={styles.orderId}>
                                                {formatOrderRef(order)}
                                            </strong>
                                            <span>{formatOrderDate(order.createdAt)}</span>
                                        </td>
                                        <td className={styles.cellCustomer}>
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
                                        <td className={styles.cellItems}>
                                            <div className={styles.itemPreview}>
                                                <div className={styles.itemThumb}>
                                                    <ProductImage
                                                        src={leadItem?.image}
                                                        alt=""
                                                        placeholder={<Package size={14} />}
                                                    />
                                                </div>
                                                <div>
                                                    <strong>
                                                      {order.items?.length ?? 0}{" "}
                                                      {(order.items?.length ?? 0) === 1
                                                        ? "item"
                                                        : "items"}
                                                    </strong>
                                                    <span>{leadItem?.name || "-"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className={styles.cellTotal}>
                                            <strong className={styles.amount}>
                                                {formatOrderAmount(order.totalAmount)}
                                            </strong>
                                            <span className={styles.paidBadge}>
                                                {order.paymentStatus || "paid"}
                                            </span>
                                        </td>
                                        <td className={styles.cellStatus}>
                                            <span className={`${styles.status} ${styles[`status_${status}`]}`}>
                                                {orderStatusLabel[status]}
                                            </span>
                                        </td>
                                        <td className={styles.cellTracking}>
                                            {order.courier?.waybill ? (
                                                <div className={styles.trackingCell}>
                                                    <strong>{order.courier.waybill}</strong>
                                                    {order.courier.trackingUrl ? (
                                                        <a
                                                            href={order.courier.trackingUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            Track
                                                        </a>
                                                    ) : (
                                                        <span>Delhivery</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className={styles.noTracking}>No AWB</span>
                                            )}
                                        </td>
                                        <td className={styles.cellActions} onClick={(event) => event.stopPropagation()}>
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
                    <div className={paymentStyles.pagination}>
                        <span>
                            Page {ordersPage?.page ?? page} of {totalPages}
                            {isFetching ? " · Loading..." : ""}
                        </span>
                        <button
                            type="button"
                            className={paymentStyles.pageButton}
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            className={paymentStyles.pageButton}
                            disabled={page >= totalPages}
                            onClick={() => setPage((current) => current + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
