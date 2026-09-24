import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import {
    useOrderDetail,
    useRequestReturn,
} from "../../features/orders/hooks/useOrders";
import OrderDetailContent from "../../features/orders/components/OrderDetailContent";
import { formatOrderRef } from "../../features/orders/api/order.api";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import type { Order, ReturnItemSelection } from "../../features/orders/types/order.types";
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

/** Mirrors the server's calculation (return_service.calculate_refund_amount);
 * the amount the store shows on the return is the one that counts. */
const estimateRefund = (order: Order, quantities: number[]): number => {
    const lines = order.items ?? [];
    const wholeOrder = lines.every((line, index) => (quantities[index] ?? 0) >= line.quantity);
    const remaining = Math.max((order.totalAmount || 0) - (order.refundedAmount || 0), 0);
    if (wholeOrder) {
        return remaining;
    }
    const subtotal = order.subtotal || lines.reduce((sum, line) => sum + (line.subtotal || 0), 0);
    const discount = Math.min(Math.max(order.discount || 0, 0), subtotal);
    const returnedValue = lines.reduce((sum, line, index) => {
        if (!line.quantity) return sum;
        return sum + ((line.subtotal || 0) * (quantities[index] ?? 0)) / line.quantity;
    }, 0);
    const share = subtotal > 0 ? (discount * returnedValue) / subtotal : 0;
    return Math.min(Math.max(Math.round((returnedValue - share) * 100) / 100, 0), remaining);
};

const OrderDetail = () => {
    const navigate = useNavigate();
    const { orderId = "" } = useParams();
    const { tenantSlug } = useStorefrontTenant();
    const { data: order, isLoading, isError } = useOrderDetail(orderId);
    const requestReturn = useRequestReturn(orderId);
    const { formatPrice } = useFormatStorePrice();
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    // Quantity to return per order line; null (untouched) means everything.
    const [returnQuantities, setReturnQuantities] = useState<number[] | null>(null);
    const quantities = useMemo(
        () => returnQuantities ?? (order?.items ?? []).map((item) => item.quantity),
        [returnQuantities, order?.items],
    );
    const selectedCount = quantities.reduce((sum, quantity) => sum + quantity, 0);
    const isWholeOrder = (order?.items ?? []).every(
        (item, index) => (quantities[index] ?? 0) >= item.quantity,
    );

    const setLineQuantity = (index: number, quantity: number) => {
        const next = [...quantities];
        next[index] = quantity;
        setReturnQuantities(next);
    };
    const goOrders = () => storefrontNavigate(
        navigate,
        tenantSlug ? routes.orders(tenantSlug) : "/",
    );

    const handleReturn = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        if (!order) return;
        if (selectedCount === 0) {
            setError("Select at least one item to return.");
            return;
        }
        const items: ReturnItemSelection[] | undefined = isWholeOrder
            ? undefined
            : order.items
                .map((item, index) => ({
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    quantity: quantities[index] ?? 0,
                }))
                .filter((item) => item.quantity > 0);
        try {
            await requestReturn.mutateAsync({ reason: reason.trim(), items });
            setReason("");
            setReturnQuantities(null);
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
                    <h1>Order {formatOrderRef(order)}</h1>
                    <p>Full breakdown of your purchase and delivery information.</p>
                </div>

                <OrderDetailContent order={order} />

                {order.canRequestReturn ? (
                    <form className={styles.returnCard} onSubmit={handleReturn}>
                        <span className={styles.eyebrow}>RETURNS</span>
                        <h2>Request a return</h2>
                        <p>
                            Returns are available for 2 days after delivery.
                            Choose what you are sending back and share a reason so
                            the store can arrange reverse pickup.
                        </p>
                        <fieldset className={styles.returnItems}>
                            <legend>Items to return</legend>
                            {order.items.map((item, index) => {
                                const quantity = quantities[index] ?? 0;
                                const inputId = `return-item-${index}`;
                                return (
                                    <div
                                        key={`${item.productId}-${item.variantId ?? ""}-${index}`}
                                        className={styles.returnItem}
                                    >
                                        <input
                                            id={inputId}
                                            type="checkbox"
                                            checked={quantity > 0}
                                            onChange={(event) =>
                                                setLineQuantity(index, event.target.checked ? item.quantity : 0)
                                            }
                                        />
                                        <label htmlFor={inputId}>
                                            <strong>{item.name}</strong>
                                            <span>
                                                {[item.size ? `Size ${item.size}` : "", item.color || ""]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                        </label>
                                        {item.quantity > 1 ? (
                                            <select
                                                aria-label={`Quantity of ${item.name} to return`}
                                                value={quantity}
                                                onChange={(event) =>
                                                    setLineQuantity(index, Number(event.target.value))
                                                }
                                            >
                                                {Array.from({ length: item.quantity + 1 }, (_, count) => (
                                                    <option key={count} value={count}>
                                                        {count} of {item.quantity}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className={styles.returnQty}>Qty 1</span>
                                        )}
                                    </div>
                                );
                            })}
                        </fieldset>
                        {selectedCount > 0 ? (
                            <p className={styles.returnEstimate}>
                                Estimated refund{" "}
                                <strong>{formatPrice(estimateRefund(order, quantities))}</strong>
                                {isWholeOrder
                                    ? ""
                                    : " · your share of the item price after any coupon discount. Shipping is not refunded on a partial return."}
                            </p>
                        ) : null}
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
                        {returnRequest.partial && returnRequest.items?.length ? (
                            <p>
                                Returning:{" "}
                                {returnRequest.items
                                    .map((item) => `${item.name || "Item"} × ${item.quantity}`)
                                    .join(", ")}
                            </p>
                        ) : null}
                        {typeof returnRequest.refundAmount === "number"
                        && returnRequest.status !== "rejected" ? (
                            <p>
                                {returnRequest.status === "refunded" ? "Refunded" : "Refund amount"}:{" "}
                                <strong>{formatPrice(returnRequest.refundAmount)}</strong>
                            </p>
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
