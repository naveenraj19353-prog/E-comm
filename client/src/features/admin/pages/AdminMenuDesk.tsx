import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
    getMenuCarts,
    getMenuDailyPassword,
    markMenuCartPaymentDone,
} from "../api/menu.api";
import { useTenantByTenantId } from "../hooks/useTenants";
import type { MenuCart } from "../api/menu.api";
import { isMenuBusiness } from "../../tenant/businessMode";
import { formatOrderAmount } from "../../orders/api/order.api";
import { useAlert } from "../../../components/Modal";
import styles from "../styles/AdminMenuDesk.module.css";

export default function AdminMenuDesk() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const [tableFilter, setTableFilter] = useState("");
    const [busyUserId, setBusyUserId] = useState<string | null>(null);

    const { data: tenant, isLoading: tenantLoading } =
        useTenantByTenantId(tenantId);
    const passwordQuery = useQuery({
        queryKey: ["menu", "daily-password", tenantId],
        queryFn: () => getMenuDailyPassword(tenantId),
        enabled: Boolean(tenantId),
        refetchInterval: 60000,
    });
    const cartsQuery = useQuery({
        queryKey: ["menu", "carts", tenantId],
        queryFn: () => getMenuCarts(tenantId),
        enabled: Boolean(tenantId),
        refetchInterval: 8000,
    });

    const carts = cartsQuery.data?.data || [];

    const filteredCarts = useMemo(() => {
        const table = tableFilter.trim().toLowerCase();
        if (!table) {
            return carts;
        }
        return carts.filter((cart) =>
            String(cart.counterNumber || "").toLowerCase().includes(table),
        );
    }, [carts, tableFilter]);

    const groupedByTable = useMemo(() => {
        const groups = new Map<string, MenuCart[]>();
        for (const cart of filteredCarts) {
            const key = cart.counterNumber || "Unassigned";
            const list = groups.get(key) || [];
            list.push(cart);
            groups.set(key, list);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [filteredCarts]);

    const handlePaymentDone = async (userId: string) => {
        try {
            setBusyUserId(userId);
            await markMenuCartPaymentDone(userId, tenantId);
            await queryClient.invalidateQueries({
                queryKey: ["menu", "carts", tenantId],
            });
        } catch (error) {
            console.error("Payment done failed:", error);
            showAlert("Unable to mark payment done.", { tone: "danger" });
        } finally {
            setBusyUserId(null);
        }
    };

    if (tenantLoading) {
        return <div className={styles.state}>Loading menu desk...</div>;
    }

    if (!tenant || !isMenuBusiness(tenant.businessType)) {
        return (
            <div className={styles.state}>
                <h2>Menu desk unavailable</h2>
                <p>This store is not a menu / hotel business.</p>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                >
                    Back to store
                </button>
            </div>
        );
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
                        ← Back
                    </button>
                    <div className={styles.eyebrow}>Hotel / Menu</div>
                    <h1>Menu Desk</h1>
                    <p>
                        Live carts by table for {tenant.name}. Guests only add
                        items — settle payment here.
                    </p>
                </div>
            </div>

            <section className={styles.passwordCard}>
                <div>
                    <h2>Today’s guest password</h2>
                    <p>
                        Guests use this code with their mobile and table number.
                        One password is generated automatically each day and
                        cannot change during that day.
                    </p>
                    {passwordQuery.data?.password ? (
                        <div className={styles.passwordReveal}>
                            <span>Share with staff / guests:</span>
                            <strong>{passwordQuery.data.password}</strong>
                        </div>
                    ) : (
                        <p className={styles.passwordHint}>
                            {passwordQuery.isLoading
                                ? "Loading today’s password..."
                                : "Unable to load today’s password."}
                        </p>
                    )}
                    {passwordQuery.data?.expiresAt ? (
                        <p className={styles.passwordHint}>
                            Valid until{" "}
                            {new Date(
                                passwordQuery.data.expiresAt,
                            ).toLocaleString("en-IN")}
                        </p>
                    ) : null}
                </div>
            </section>

            <section className={styles.filters}>
                <h2 className={styles.sectionTitle}>Live carts</h2>
                <input
                    className={styles.tableInput}
                    value={tableFilter}
                    onChange={(event) => setTableFilter(event.target.value)}
                    placeholder="Filter by table / room"
                />
            </section>

            {cartsQuery.isLoading ? (
                <div className={styles.state}>Loading carts...</div>
            ) : cartsQuery.isError ? (
                <div className={styles.state}>Unable to load carts.</div>
            ) : groupedByTable.length === 0 ? (
                <div className={styles.state}>
                    No open carts yet. Guests will appear here as they add food.
                </div>
            ) : (
                <div className={styles.tableGroups}>
                    {groupedByTable.map(([table, tableCarts]) => (
                        <section key={table} className={styles.tableGroup}>
                            <div className={styles.tableHeader}>
                                <h2>Table / room {table}</h2>
                                <span>
                                    {tableCarts.length} guest
                                    {tableCarts.length === 1 ? "" : "s"}
                                </span>
                            </div>
                            <div className={styles.orderList}>
                                {tableCarts.map((cart) => (
                                    <article
                                        key={cart.userId}
                                        className={styles.orderCard}
                                    >
                                        <div className={styles.orderMeta}>
                                            <strong>
                                                {formatOrderAmount(
                                                    cart.totalAmount,
                                                )}
                                            </strong>
                                            <span>Open cart</span>
                                            <span>
                                                {cart.phone || "Guest"} ·{" "}
                                                {cart.itemCount} item
                                                {cart.itemCount === 1
                                                    ? ""
                                                    : "s"}
                                            </span>
                                        </div>
                                        <ul className={styles.itemList}>
                                            {cart.items.map((item) => (
                                                <li
                                                    key={`${cart.userId}-${item.productId}-${item.variantId}`}
                                                >
                                                    {item.quantity}× {item.name}
                                                </li>
                                            ))}
                                        </ul>
                                        <button
                                            type="button"
                                            className={styles.primaryButton}
                                            disabled={
                                                busyUserId === cart.userId
                                            }
                                            onClick={() =>
                                                handlePaymentDone(cart.userId)
                                            }
                                        >
                                            {busyUserId === cart.userId
                                                ? "Updating..."
                                                : "Payment Done"}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
