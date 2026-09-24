import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLedgerOverview } from "../hooks/useLedger";
import { formatOrderAmount } from "../../orders/api/order.api";
import { formatStorefrontHost } from "../../tenant/tenantHost";
import styles from "../styles/TenantsPage.module.css";
import paymentStyles from "../styles/AdminTenantPayments.module.css";

const PAGE_SIZE = 25;

export default function AdminLedgerOverview() {
    const [page, setPage] = useState(1);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const dateRange = useMemo(
        () => ({
            fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
            toDate: toDate ? new Date(toDate).toISOString() : undefined,
        }),
        [fromDate, toDate],
    );

    const { data, isLoading, isError } = useLedgerOverview(page, PAGE_SIZE, dateRange);
    const rows = data?.rows || [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    const handleClearDates = () => {
        setFromDate("");
        setToDate("");
        setPage(1);
    };

    if (isLoading) {
        return <div className={styles.state}>Loading payouts overview...</div>;
    }

    if (isError) {
        return <div className={styles.state}>Failed to load payouts overview.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>PLATFORM</span>
                    <h2>Payouts</h2>
                    <p>See what the platform owes every store and manage payouts.</p>
                </div>
            </div>

            <div className={paymentStyles.filterBar}>
                <div className={paymentStyles.field}>
                    <label htmlFor="overview-from-date">From</label>
                    <input
                        id="overview-from-date"
                        type="date"
                        value={fromDate}
                        onChange={(event) => {
                            setFromDate(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className={paymentStyles.field}>
                    <label htmlFor="overview-to-date">To</label>
                    <input
                        id="overview-to-date"
                        type="date"
                        value={toDate}
                        onChange={(event) => {
                            setToDate(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <button
                    type="button"
                    className={paymentStyles.clearButton}
                    onClick={handleClearDates}
                    disabled={!fromDate && !toDate}
                >
                    Clear
                </button>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                    <h3>Tenant Ledger Overview</h3>
                    <span>Stores with ledger activity, ranked by balance due.</span>
                </div>
                {rows.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No tenant ledger activity yet.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Store</th>
                                        <th>Slug</th>
                                        <th>Commission %</th>
                                        <th>Gross</th>
                                        <th>Commission</th>
                                        <th>Gateway Fee</th>
                                        <th>Delivery Charges</th>
                                        <th>Net</th>
                                        <th>Paid Out</th>
                                        <th>Balance Due</th>
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
                                            <td>{row.commissionPercent}%</td>
                                            <td>{formatOrderAmount(row.grossAmount)}</td>
                                            <td>{formatOrderAmount(row.commissionAmount)}</td>
                                            <td>{formatOrderAmount(row.gatewayFee)}</td>
                                            <td>{formatOrderAmount(row.deliveryCharge)}</td>
                                            <td>{formatOrderAmount(row.netAmount)}</td>
                                            <td>{formatOrderAmount(row.totalPaidOut)}</td>
                                            <td>
                                                <strong>{formatOrderAmount(row.balanceDue)}</strong>
                                            </td>
                                            <td>
                                                <Link
                                                    to={`/admin/tenants/${row.tenantId}/payments`}
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
