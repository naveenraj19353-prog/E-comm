import { MapPin, Package, Receipt, User } from "lucide-react";
import type { Order } from "../types/order.types";
import {
    formatOrderAmount,
    formatOrderDate,
    orderStatusLabel,
} from "../api/order.api";
import ProductImage from "../../../components/ProductImage";
import styles from "./OrderDetailContent.module.css";

interface OrderDetailContentProps {
    order: Order;
    showCustomer?: boolean;
    showPaymentIds?: boolean;
    variant?: "storefront" | "admin";
}

const formatAddress = (order: Order): string => {
    const address = order.address;
    if (!address) {
        return "Address not available";
    }
    return [
        address.addressLine1,
        address.addressLine2,
        `${address.city ?? ""}, ${address.state ?? ""} ${address.postalCode ?? ""}`.trim(),
        address.country,
    ]
        .filter(Boolean)
        .join(", ");
};

const OrderDetailContent = ({
    order,
    showCustomer = false,
    showPaymentIds = false,
    variant = "storefront",
}: OrderDetailContentProps) => {
    const status = order.orderStatus || "confirmed";
    const isAdmin = variant === "admin";
    const orderItems = order.items ?? [];

    return (
        <div className={`${styles.content} ${isAdmin ? styles.admin : ""}`}>
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <span>Order ID</span>
                    <strong>#{order.orderId.slice(-8).toUpperCase()}</strong>
                </div>
                <div className={styles.summaryCard}>
                    <span>Placed on</span>
                    <strong>{formatOrderDate(order.createdAt)}</strong>
                </div>
                <div className={styles.summaryCard}>
                    <span>Status</span>
                    <strong className={`${styles.status} ${styles[`status_${status}`]}`}>
                        {orderStatusLabel[status]}
                    </strong>
                </div>
                <div className={styles.summaryCard}>
                    <span>Payment</span>
                    <strong className={styles.paymentValue}>
                        {order.paymentStatus || "paid"}
                    </strong>
                </div>
            </div>

            {showCustomer && order.customer && (
                <section className={styles.section}>
                    <h2>
                        <User size={16} />
                        Customer
                    </h2>
                    <p className={styles.textBlock}>
                        <strong>{order.customer?.name || "Customer"}</strong>
                        <span>{order.customer?.email || "-"}</span>
                    </p>
                </section>
            )}

            <section className={styles.section}>
                <h2>
                    <Package size={16} />
                    Items ({orderItems.length})
                </h2>
                <div className={styles.items}>
                    {orderItems.map((item, index) => (
                        <div
                            key={`${order.orderId}-${item.productId}-${item.variantId}`}
                            className={`${styles.item} ${index < orderItems.length - 1 ? styles.itemDivider : ""}`}
                        >
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
                                    {item.size ? ` · Size ${item.size}` : ""}
                                    {item.color ? ` · ${item.color}` : ""}
                                </span>
                                <span>{formatOrderAmount(item.price)} each</span>
                            </div>
                            <strong className={styles.itemPrice}>
                                {formatOrderAmount(item.subtotal)}
                            </strong>
                        </div>
                    ))}
                </div>
            </section>

            <div className={styles.twoCol}>
                <section className={styles.section}>
                    <h2>
                        <MapPin size={16} />
                        Delivery address
                    </h2>
                    <div className={styles.textBlock}>
                        {order.address?.fullName && (
                            <strong>{order.address?.fullName}</strong>
                        )}
                        {order.address?.phone && <span>{order.address?.phone}</span>}
                        <span>{formatAddress(order)}</span>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2>
                        <Receipt size={16} />
                        Price summary
                    </h2>
                    <div className={styles.priceRows}>
                        <div className={styles.priceRow}>
                            <span>Subtotal</span>
                            <strong>{formatOrderAmount(order.subtotal)}</strong>
                        </div>
                        {(order.discount ?? 0) > 0 && (
                            <div className={styles.priceRow}>
                                <span>Discount</span>
                                <strong className={styles.discount}>
                                    -{formatOrderAmount(order.discount ?? 0)}
                                </strong>
                            </div>
                        )}
                        <div className={styles.priceRow}>
                            <span>Shipping</span>
                            <strong>
                                {(order.shipping ?? 0) === 0
                                    ? "FREE"
                                    : formatOrderAmount(order.shipping ?? 0)}
                            </strong>
                        </div>
                        <div className={`${styles.priceRow} ${styles.totalRow}`}>
                            <span>Total paid</span>
                            <strong>{formatOrderAmount(order.totalAmount)}</strong>
                        </div>
                    </div>
                </section>
            </div>

            {showPaymentIds && (order.razorpayOrderId || order.razorpayPaymentId) && (
                <section className={styles.section}>
                    <h2>Payment reference</h2>
                    <div className={styles.metaList}>
                        {order.razorpayOrderId && (
                            <div className={styles.metaItem}>
                                <span>Razorpay order</span>
                                <code>{order.razorpayOrderId}</code>
                            </div>
                        )}
                        {order.razorpayPaymentId && (
                            <div className={styles.metaItem}>
                                <span>Razorpay payment</span>
                                <code>{order.razorpayPaymentId}</code>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
};

export default OrderDetailContent;
