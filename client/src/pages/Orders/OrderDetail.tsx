import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useOrderDetail } from "../../features/orders/hooks/useOrders";
import OrderDetailContent from "../../features/orders/components/OrderDetailContent";
import OrderWhatsAppButton from "../../features/orders/share/OrderWhatsAppButton";
import type { OrderWhatsAppInput } from "../../features/orders/share/orderWhatsAppShare";
import type { Order } from "../../features/orders/types/order.types";
import PageLoader from "../../components/PageLoader";
import styles from "./OrderDetail.module.css";

const toWhatsAppOrder = (
    order: Order,
    tenantSlug: string,
    storeName?: string,
): OrderWhatsAppInput => ({
    tenantSlug,
    orderId: order.orderId,
    storeName,
    items: (order.items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        subtotal: item.subtotal,
    })),
    total: order.totalAmount,
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    paymentMethod: order.paymentStatus === "pending" ? "Cash on Delivery" : "Online Payment",
    paymentStatus: order.paymentStatus,
    address: order.address ?? undefined,
});

const OrderDetail = () => {
    const navigate = useNavigate();
    const { orderId = "" } = useParams();
    const { tenantSlug, tenant } = useStorefrontTenant();
    const { data: order, isLoading, isError } = useOrderDetail(orderId);

    if (isLoading) {
        return <PageLoader message="Loading order details..." />;
    }

    if (isError || !order) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.state}>Order not found.</div>
                    <button
                        type="button"
                        className={styles.backLink}
                        onClick={() => navigate(tenantSlug ? `/${tenantSlug}/orders` : "/")}
                    >
                        <ChevronLeft size={16} />
                        Back to orders
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <button
                    type="button"
                    className={styles.backLink}
                    onClick={() => navigate(tenantSlug ? `/${tenantSlug}/orders` : "/")}
                >
                    <ChevronLeft size={16} />
                    Back to orders
                </button>

                <div className={styles.header}>
                    <span className={styles.eyebrow}>ORDER DETAILS</span>
                    <h1>Order #{order.orderId.slice(-8).toUpperCase()}</h1>
                    <p>Full breakdown of your purchase and delivery information.</p>
                    {tenantSlug && (
                        <OrderWhatsAppButton
                            className={styles.whatsAppButton}
                            order={toWhatsAppOrder(order, tenantSlug, tenant?.name)}
                            label="Share order on WhatsApp"
                        />
                    )}
                </div>

                <OrderDetailContent order={order} />
            </div>
        </div>
    );
};

export default OrderDetail;
