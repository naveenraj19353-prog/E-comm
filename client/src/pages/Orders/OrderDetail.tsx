import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useOrderDetail } from "../../features/orders/hooks/useOrders";
import OrderDetailContent from "../../features/orders/components/OrderDetailContent";
import PageLoader from "../../components/PageLoader";
import styles from "./OrderDetail.module.css";

const OrderDetail = () => {
    const navigate = useNavigate();
    const { orderId = "" } = useParams();
    const { tenantSlug } = useStorefrontTenant();
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
                </div>

                <OrderDetailContent order={order} />
            </div>
        </div>
    );
};

export default OrderDetail;
