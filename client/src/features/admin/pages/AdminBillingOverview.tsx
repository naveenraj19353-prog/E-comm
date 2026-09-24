import { useState } from "react";
import { Link } from "react-router-dom";
import { useBillingOverview } from "../hooks/useBilling";
import { BILLING_STATUS_LABELS, type BillingOverviewRow } from "../api/billing.api";
import { formatOrderDate } from "../../orders/api/order.api";
import { formatStorefrontHost } from "../../tenant/tenantHost";
import styles from "../styles/TenantsPage.module.css";
import paymentStyles from "../styles/AdminTenantPayments.module.css";
import billingStyles from "../styles/AdminTenantBilling.module.css";

const PAGE_SIZE = 25;

function nextDateLabel(row: BillingOverviewRow): string {
    if (row.status === "trialing" && row.trialEndsAt) {
        return `Trial ends ${formatOrderDate(row.trialEndsAt)}`;
    }
    if (row.status === "active" && row.currentPeriodEnd) {
        return row.cancelledAt
            ? `Ends ${formatOrderDate(row.currentPeriodEnd)}`
            : `Next charge ${formatOrderDate(row.currentPeriodEnd)}`;
    }
    return "-";
}

export default function AdminBillingOverview() {
    const [page, setPage] = useState(1);

    const { data, isLoading, isError } = useBillingOverview(page, PAGE_SIZE);
    const rows = data?.rows || [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    if (isLoading) {
        return <div className={styles.state}>Loading billing overview...</div>;
    }

    if (isError) {
        return <div className={styles.state}>Failed to load billing overview.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>PLATFORM</span>
                    <h2>Billing</h2>
                    <p>Every store's free trial and subscription standing.</p>
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                    <h3>Store Subscriptions</h3>
                    <span>Newest stores first.</span>
                </div>
                {rows.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No stores yet.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Store</th>
                                        <th>Slug</th>
                                        <th>Status</th>
                                        <th>Trial Ends / Next Charge</th>
                                        <th>Grace Ends</th>
                                        <th>Auto-pay</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.tenantId}>
                                            <td>
                                                <strong>{row.name}</strong>
                                            </td>
                                            <td>
                                                <span className={styles.tenantId}>
                                                    {formatStorefrontHost(row.slug)}
                                                </span>
                                            </td>
                                            <td>
                                                <span
                                                    className={`${billingStyles.status} ${billingStyles[`status_${row.status}`]}`}
                                                >
                                                    {BILLING_STATUS_LABELS[row.status] || row.status}
                                                </span>
                                            </td>
                                            <td>{nextDateLabel(row)}</td>
                                            <td>{row.graceEndsAt ? formatOrderDate(row.graceEndsAt) : "-"}</td>
                                            <td>
                                                {row.autopaySetUp ? (
                                                    <span className={billingStyles.autopayYes}>✓</span>
                                                ) : (
                                                    <span className={billingStyles.autopayNo}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                <Link
                                                    to={`/admin/tenants/${row.tenantId}/billing`}
                                                    className={styles.tenantId}
                                                >
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={paymentStyles.pagination}>
                            <span>
                                Page {data?.page ?? page} of {totalPages}
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
                    </>
                )}
            </div>
        </div>
    );
}
