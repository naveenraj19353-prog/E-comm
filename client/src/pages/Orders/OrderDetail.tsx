import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import {
    useOrderDetail,
    useRequestReturn,
} from "../../features/orders/hooks/useOrders";
import OrderDetailContent from "../../features/orders/components/OrderDetailContent";
import PageLoader from "../../components/PageLoader";
import styles from "./OrderDetail.module.css";
import { routes, storefrontNavigate } from "../../routes/routes";

const returnCopy: Record<string, string> = {
    requested: "Your return request is with the store. We will share pickup details after it is approved.",
    approved: "Your return is approved. Keep the package ready for reverse pickup.",
    rejected: "This return request was not approved.",
    received: "The store received your return. Refund will follow.",
    refunded: "Refund has been issued for this order.",
};

const OrderDetail = () => {
    const navigate = useNavigate();
    const { orderId = "" } = useParams();
    const { tenantSlug } = useStorefrontTenant();
    const { data: order, isLoading, isError } = useOrderDetail(orderId);
    const requestReturn = useRequestReturn(orderId);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const goOrders = () => storefrontNavigate(
        navigate,
        tenantSlug ? routes.orders(tenantSlug) : "/",
    );

    const handleReturn = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        try {
            await requestReturn.mutateAsync(reason.trim());
            setReason("");
        } catch (err) {
            const detail = axios.isAxiosError(err)
                ? err.response?.data?.detail
                : undefined;
            setError(
                typeof detail === "string"
                    ? detail
                    : "Unable to request a return right now.",
            );
        }
    };

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
                        onClick={goOrders}
                    >
                        <ChevronLeft size={16} />
                        Back to orders
                    </button>
                </div>
            </div>
        );
    }

    const returnRequest = order.returnRequest;

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <button
                    type="button"
                    className={styles.backLink}
                    onClick={goOrders}
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

                {order.canRequestReturn ? (
                    <form className={styles.returnCard} onSubmit={handleReturn}>
                        <span className={styles.eyebrow}>RETURNS</span>
                        <h2>Request a return</h2>
                        <p>
                            Returns are available for 2 days after delivery.
                            Share a reason so the store can arrange reverse pickup.
                        </p>
                        <textarea
                            className={styles.returnReason}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            minLength={3}
                            maxLength={500}
                            required
                            placeholder="Why are you returning this order?"
                        />
                        {error ? <p className={styles.returnError}>{error}</p> : null}
                        <button
                            type="submit"
                            className={styles.returnButton}
                            disabled={requestReturn.isPending}
                        >
                            {requestReturn.isPending ? "Sending..." : "Submit return request"}
                        </button>
                    </form>
                ) : null}

                {returnRequest ? (
                    <section className={styles.returnCard}>
                        <span className={styles.eyebrow}>RETURNS</span>
                        <h2>Return status</h2>
                        <p>
                            {returnCopy[returnRequest.status]
                                || "Your return request is in progress."}
                        </p>
                        {returnRequest.reason ? (
                            <p>Reason: {returnRequest.reason}</p>
                        ) : null}
                        {returnRequest.rejectReason ? (
                            <p>Store note: {returnRequest.rejectReason}</p>
                        ) : null}
                        {returnRequest.reverseAwb ? (
                            <p>
                                Reverse AWB <strong>{returnRequest.reverseAwb}</strong>
                                {returnRequest.reverseTrackingUrl ? (
                                    <>
                                        {" · "}
                                        <a
                                            href={returnRequest.reverseTrackingUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Track pickup
                                        </a>
                                    </>
                                ) : null}
                            </p>
                        ) : null}
                        {returnRequest.refundNote ? (
                            <p>{returnRequest.refundNote}</p>
                        ) : null}
                    </section>
                ) : null}
            </div>
        </div>
    );
};

export default OrderDetail;
