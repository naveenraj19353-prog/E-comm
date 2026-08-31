import { Package, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useUserOrders } from "../../features/orders/hooks/useOrders";
import {
    formatOrderAmount,
    formatOrderDate,
    orderStatusLabel,
} from "../../features/orders/api/order.api";
import PageLoader from "../../components/PageLoader";
import AuthModal from "../../components/Auth/AuthModal/AuthModal";
import ProductImage from "../../components/ProductImage";
import styles from "./MyOrders.module.css";

const MyOrders = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { tenantSlug, tenantId } = useStorefrontTenant();
    const userId = user?._id || "";
    const { data: orders = [], isLoading, isError } = useUserOrders(userId);

    if (!user) {
        return (
            <div className={styles.page}>
                <AuthModal
                    tenantId={tenantId}
                    onClose={() => navigate(tenantSlug ? `/${tenantSlug}` : "/")}
                    onSuccess={() => undefined}
                />
            </div>
        );
    }

    if (isLoading) {
        return <PageLoader message="Loading your orders..." />;
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.eyebrow}>YOUR ACCOUNT</span>
                    <h1>My Orders</h1>
                    <p>Track and review your past purchases.</p>
                </div>

                {isError ? (
                    <div className={styles.state}>Unable to load orders. Please try again.</div>
                ) : orders.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                            <Package size={28} />
                        </div>
                        <h2>No orders yet</h2>
                        <p>When you place an order, it will show up here.</p>
                        <button
                            type="button"
                            className={styles.shopButton}
                            onClick={() => navigate(tenantSlug ? `/${tenantSlug}/products` : "/")}
                        >
                            Start shopping
                        </button>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {orders.map((order) => (
                            <article
                                key={order.orderId}
                                className={styles.card}
                                onClick={() =>
                                    navigate(
                                        tenantSlug
                                            ? `/${tenantSlug}/orders/${order.orderId}`
                                            : `/orders/${order.orderId}`,
                                    )
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        navigate(
                                            tenantSlug
                                                ? `/${tenantSlug}/orders/${order.orderId}`
                                                : `/orders/${order.orderId}`,
                                        );
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                            >
                                <div className={styles.cardHeader}>
                                    <div>
                                        <span className={styles.orderId}>
                                            Order #{order.orderId.slice(-8).toUpperCase()}
                                        </span>
                                        <span className={styles.date}>
                                            {formatOrderDate(order.createdAt)}
                                        </span>
                                    </div>
                                    <span
                                        className={`${styles.status} ${styles[`status_${order.orderStatus || "confirmed"}`]}`}
                                    >
                                        {orderStatusLabel[order.orderStatus || "confirmed"]}
                                    </span>
                                </div>

                                <div className={styles.items}>
                                    {(order.items ?? []).map((item) => (
                                        <div key={`${order.orderId}-${item.productId}-${item.variantId}`} className={styles.item}>
                                            <div className={styles.imageWrap}>
                                                <ProductImage
                                                    src={item.image}
                                                    alt={item.name}
                                                    placeholder={<Package size={18} />}
                                                />
                                            </div>
                                            <div className={styles.itemDetails}>
                                                <strong>{item.name}</strong>
                                                <span>
                                                    Qty {item.quantity}
                                                    {item.size ? ` · ${item.size}` : ""}
                                                    {item.color ? ` · ${item.color}` : ""}
                                                </span>
                                            </div>
                                            <strong className={styles.itemPrice}>
                                                {formatOrderAmount(item.subtotal)}
                                            </strong>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.cardFooter}>
                                    <div>
                                        <span>Total paid</span>
                                        <strong>{formatOrderAmount(order.totalAmount)}</strong>
                                    </div>
                                    {order.address?.fullName && (
                                        <div className={styles.address}>
                                            <span>Deliver to</span>
                                            <strong>
                                                {order.address?.fullName}
                                                {order.address?.city
                                                    ? `, ${order.address.city}`
                                                    : ""}
                                            </strong>
                                        </div>
                                    )}
                                    <span className={styles.viewDetails}>View full details →</span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    className={styles.backLink}
                    onClick={() => navigate(tenantSlug ? `/${tenantSlug}/profile` : "/")}
                >
                    <ChevronLeft size={16} />
                    Back to profile
                </button>
            </div>
        </div>
    );
};

export default MyOrders;
