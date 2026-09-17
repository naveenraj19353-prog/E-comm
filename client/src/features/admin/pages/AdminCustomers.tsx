import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getAdminCustomers } from "../api/customer.api";
import { useTenantByTenantId } from "../hooks/useTenants";
import { isMenuBusiness } from "../../tenant/businessMode";
import styles from "../styles/AdminCustomers.module.css";

export default function AdminCustomers() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const { data: tenant } = useTenantByTenantId(tenantId);
    const showTableNumber = isMenuBusiness(tenant?.businessType);
    const customersQuery = useQuery({
        queryKey: ["admin", "customers", tenantId],
        queryFn: () => getAdminCustomers(tenantId),
        enabled: Boolean(tenantId),
        refetchInterval: 10000,
    });

    const customers = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) {
            return customersQuery.data || [];
        }
        return (customersQuery.data || []).filter((customer) =>
            [
                customer.name,
                customer.email,
                customer.phone,
                customer.counterNumber,
                ...customer.activity.cart.map((item) => item.category),
                ...customer.activity.wishlist.map((item) => item.category),
            ].some((value) => String(value || "").toLowerCase().includes(query)),
        );
    }, [customersQuery.data, search]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                    >
                        ← Back
                    </button>
                    <span className={styles.eyebrow}>CUSTOMERS</span>
                    <h1>Customer Activity</h1>
                    <p>Customer details with current cart and wishlist items.</p>
                </div>
                <input
                    className={styles.search}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                        showTableNumber
                            ? "Search name, mobile, email or table"
                            : "Search name, mobile, email or category"
                    }
                />
            </header>

            {customersQuery.isLoading ? (
                <div className={styles.state}>Loading customers...</div>
            ) : customersQuery.isError ? (
                <div className={styles.state}>Unable to load customers.</div>
            ) : customers.length === 0 ? (
                <div className={styles.state}>No customers found.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Contact</th>
                                <th>
                                    {showTableNumber
                                        ? "Table / Room"
                                        : "Category"}
                                </th>
                                <th>Cart & Wishlist</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((customer) => (
                                <tr key={customer._id} className={styles.row}>
                                    <td className={styles.cellCustomer}>
                                        <strong>{customer.name || "Customer"}</strong>
                                        <span className={styles.customerId}>
                                            {customer._id}
                                        </span>
                                    </td>
                                    <td className={styles.cellContact}>
                                        <strong>{customer.phone || "—"}</strong>
                                        <span>{customer.email || "—"}</span>
                                    </td>
                                    <td className={styles.cellCategory}>
                                        {showTableNumber ? (
                                            customer.counterNumber || "—"
                                        ) : (
                                            <div className={styles.categories}>
                                                {[
                                                    ...new Set([
                                                        ...customer.activity.cart.map(
                                                            (item) =>
                                                                item.category,
                                                        ),
                                                        ...customer.activity.wishlist.map(
                                                            (item) =>
                                                                item.category,
                                                        ),
                                                    ]),
                                                ].map((category) => (
                                                    <span key={category}>
                                                        {category}
                                                    </span>
                                                ))}
                                                {!customer.activity.cart.length &&
                                                !customer.activity.wishlist
                                                    .length
                                                    ? "—"
                                                    : null}
                                            </div>
                                        )}
                                    </td>
                                    <td className={styles.cellActivity}>
                                        <div className={styles.activity}>
                                            <div className={styles.activityBlock}>
                                                <strong>
                                                    Cart ({customer.activity.cartCount})
                                                </strong>
                                                {customer.activity.cart.length ? (
                                                    <ul>
                                                        {customer.activity.cart.map(
                                                            (item) => (
                                                                <li
                                                                    key={`${customer._id}-cart-${item.productId}`}
                                                                    className={styles.activityItem}
                                                                >
                                                                    <span className={styles.itemName}>
                                                                        {item.name}
                                                                    </span>
                                                                    <span className={styles.itemQty}>
                                                                        ×{item.quantity}
                                                                    </span>
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                ) : (
                                                    <span className={styles.emptyHint}>Empty</span>
                                                )}
                                            </div>
                                            <div className={styles.activityBlock}>
                                                <strong>
                                                    Wishlist ({customer.activity.wishlistCount})
                                                </strong>
                                                {customer.activity.wishlist.length ? (
                                                    <ul>
                                                        {customer.activity.wishlist.map(
                                                            (item) => (
                                                                <li
                                                                    key={`${customer._id}-wish-${item.productId}`}
                                                                    className={styles.activityItem}
                                                                >
                                                                    <span className={styles.itemName}>
                                                                        {item.name}
                                                                    </span>
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                ) : (
                                                    <span className={styles.emptyHint}>Empty</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className={styles.cellStatus}>
                                        <span
                                            className={
                                                customer.isActive === false
                                                    ? styles.inactive
                                                    : styles.active
                                            }
                                        >
                                            {customer.isActive === false
                                                ? "Inactive"
                                                : "Active"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
