import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useTenantByTenantId } from "../hooks/useTenants";
import {
    useLedgerPayouts,
    useLedgerStatement,
    useRecordPayout,
    useSyncDeliveryCharge,
    useUpdateCommission,
} from "../hooks/useLedger";
import {
    formatOrderAmount,
    formatOrderDate,
    formatOrderRef,
} from "../../orders/api/order.api";
import type { LedgerEntry } from "../api/ledger.api";
import { getApiErrorMessage } from "../utils/tenantForm.utils";
import styles from "../styles/AdminTenantPayments.module.css";

const PAGE_SIZE = 25;

/** Refund state of a ledger entry; null when nothing was refunded. */
const refundLabel = (entry: LedgerEntry): string | null => {
    const refunded = entry.refundedAmount || 0;
    if (entry.status === "refunded" || (refunded > 0 && refunded >= entry.grossAmount - 0.01)) {
        return "Refunded";
    }
    return refunded > 0 ? "Partly refunded" : null;
};

export default function AdminTenantPayments() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === "super_admin";

    const [statementPage, setStatementPage] = useState(1);
    const [payoutsPage, setPayoutsPage] = useState(1);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const dateRange = useMemo(
        () => ({
            fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
            toDate: toDate ? new Date(toDate).toISOString() : undefined,
        }),
        [fromDate, toDate],
    );

    const { data: tenant } = useTenantByTenantId(tenantId);
    const {
        data: statement,
        isLoading: isStatementLoading,
        isError: isStatementError,
    } = useLedgerStatement(tenantId, statementPage, PAGE_SIZE, dateRange);
    const {
        data: payoutsData,
        isLoading: isPayoutsLoading,
        isError: isPayoutsError,
    } = useLedgerPayouts(tenantId, payoutsPage, PAGE_SIZE);

    const recordPayoutMutation = useRecordPayout();
    const updateCommissionMutation = useUpdateCommission();
    const syncDeliveryChargeMutation = useSyncDeliveryCharge();

    const [syncingOrderId, setSyncingOrderId] = useState("");
    const [syncMessage, setSyncMessage] = useState("");

    const [payoutNote, setPayoutNote] = useState("");
    const [payoutError, setPayoutError] = useState("");
    const [payoutSuccess, setPayoutSuccess] = useState("");

    const [commissionValue, setCommissionValue] = useState<string>("");
    const [commissionTouched, setCommissionTouched] = useState(false);
    const [commissionError, setCommissionError] = useState("");
    const [commissionSuccess, setCommissionSuccess] = useState("");

    const effectiveCommissionInput =
        commissionTouched
            ? commissionValue
            : tenant?.platformCommissionPercent !== null &&
              tenant?.platformCommissionPercent !== undefined
                ? String(tenant.platformCommissionPercent)
                : "";

    const handleClearDates = () => {
        setFromDate("");
        setToDate("");
        setStatementPage(1);
    };

    const handleRecordPayout = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPayoutError("");
        setPayoutSuccess("");
        recordPayoutMutation.mutate(
            {
                tenantId,
                fromDate: dateRange.fromDate,
                toDate: dateRange.toDate,
                note: payoutNote.trim() || undefined,
            },
            {
                onSuccess: () => {
                    setPayoutNote("");
                    setPayoutSuccess("Payout recorded.");
                },
                onError: (err) => {
                    setPayoutError(getApiErrorMessage(err, "Unable to record payout."));
                },
            },
        );
    };

    const handleSyncDeliveryCharge = (orderId: string) => {
        setSyncingOrderId(orderId);
        setSyncMessage("");
        syncDeliveryChargeMutation.mutate(
            { orderId, tenantId },
            {
                onSuccess: (result) => {
                    setSyncMessage(result.message);
                },
                onError: (err) => {
                    setSyncMessage(getApiErrorMessage(err, "Unable to sync delivery charge."));
                },
                onSettled: () => {
                    setSyncingOrderId("");
                },
            },
        );
    };

    const handleSaveCommission = () => {
        setCommissionError("");
        setCommissionSuccess("");
        const trimmed = effectiveCommissionInput.trim();
        const platformCommissionPercent = trimmed === "" ? null : Number(trimmed);
        if (
            platformCommissionPercent !== null &&
            (Number.isNaN(platformCommissionPercent) || platformCommissionPercent < 0)
        ) {
            setCommissionError("Enter a valid commission percentage.");
            return;
        }
        updateCommissionMutation.mutate(
            { tenantId, platformCommissionPercent },
            {
                onSuccess: () => {
                    setCommissionSuccess("Commission rate updated.");
                },
                onError: (err) => {
                    setCommissionError(getApiErrorMessage(err, "Unable to update commission rate."));
                },
            },
        );
    };

    const summary = statement?.summary;
    const entries = statement?.entries || [];
    const payouts = payoutsData?.payouts || [];
    const statementTotalPages = statement ? Math.max(1, Math.ceil(statement.total / PAGE_SIZE)) : 1;
    const payoutsTotalPages = payoutsData ? Math.max(1, Math.ceil(payoutsData.total / PAGE_SIZE)) : 1;

    const balanceDue = summary?.balanceDue || 0;
    const unsettledCount = entries.filter((entry) => !entry.settled).length;

    if (isStatementLoading) {
        return <div className={styles.state}>Loading payments...</div>;
    }

    if (isStatementError) {
        return <div className={styles.state}>Failed to load payment statement.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                >
                    ← Back to store
                </button>
                <span className={styles.eyebrow}>PAYMENTS</span>
                <h1>{tenant?.name || "Store"} payments</h1>
                <p>Track collections, commission, gateway fees, delivery charges, and payouts.</p>
            </div>

            <div className={styles.filterBar}>
                <div className={styles.field}>
                    <label htmlFor="statement-from-date">From</label>
                    <input
                        id="statement-from-date"
                        type="date"
                        value={fromDate}
                        onChange={(event) => {
                            setFromDate(event.target.value);
                            setStatementPage(1);
                        }}
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="statement-to-date">To</label>
                    <input
                        id="statement-to-date"
                        type="date"
                        value={toDate}
                        onChange={(event) => {
                            setToDate(event.target.value);
                            setStatementPage(1);
                        }}
                    />
                </div>
                <button
                    type="button"
                    className={styles.clearButton}
                    onClick={handleClearDates}
                    disabled={!fromDate && !toDate}
                >
                    Clear
                </button>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span>Gross Collected</span>
                    <strong>{formatOrderAmount(summary?.grossAmount)}</strong>
                </div>
                <div className={styles.statCard}>
                    <span>Platform Commission</span>
                    <strong>{formatOrderAmount(summary?.commissionAmount)}</strong>
                </div>
                <div className={styles.statCard}>
                    <span>Gateway Fees</span>
                    <strong>{formatOrderAmount(summary?.gatewayFee)}</strong>
                </div>
                <div className={styles.statCard}>
                    <span>Delivery Charges</span>
                    <strong>{formatOrderAmount(summary?.deliveryCharge)}</strong>
                </div>
                <div className={styles.statCard}>
                    <span>Paid Out</span>
                    <strong>{formatOrderAmount(summary?.totalPaidOut)}</strong>
                </div>
                <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                    <span>Balance Due</span>
                    <strong>{formatOrderAmount(summary?.balanceDue)}</strong>
                </div>
            </div>

            {isSuperAdmin && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>Commission Rate</h2>
                    </div>
                    <div className={styles.commissionCard}>
                        <div className={styles.field}>
                            <label htmlFor="commission-percent">Commission % (blank = platform default)</label>
                            <input
                                id="commission-percent"
                                type="number"
                                min={0}
                                step="0.1"
                                value={effectiveCommissionInput}
                                onChange={(event) => {
                                    setCommissionTouched(true);
                                    setCommissionValue(event.target.value);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            className={styles.saveButton}
                            disabled={updateCommissionMutation.isPending}
                            onClick={handleSaveCommission}
                        >
                            {updateCommissionMutation.isPending ? "Saving..." : "Save"}
                        </button>
                    </div>
                    {commissionError ? <p className={styles.error}>{commissionError}</p> : null}
                    {commissionSuccess ? <p className={styles.success}>{commissionSuccess}</p> : null}
                </div>
            )}

            {isSuperAdmin && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>Record Payout</h2>
                    </div>
                    <form className={styles.formCard} onSubmit={handleRecordPayout}>
                        <p className={styles.previewText}>
                            {balanceDue > 0
                                ? `This will settle ${formatOrderAmount(balanceDue)} across ${unsettledCount} order${unsettledCount === 1 ? "" : "s"} as paid${fromDate || toDate ? " for the selected date range" : ""}.`
                                : "Nothing unsettled for the selected date range."}
                        </p>
                        <div className={styles.formRow}>
                            <div className={styles.field}>
                                <label htmlFor="payout-note">Note (optional)</label>
                                <input
                                    id="payout-note"
                                    type="text"
                                    value={payoutNote}
                                    onChange={(event) => setPayoutNote(event.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className={styles.saveButton}
                                disabled={recordPayoutMutation.isPending || balanceDue <= 0}
                            >
                                {recordPayoutMutation.isPending ? "Recording..." : "Settle unpaid orders"}
                            </button>
                        </div>
                        {payoutError ? <p className={styles.error}>{payoutError}</p> : null}
                        {payoutSuccess ? <p className={styles.success}>{payoutSuccess}</p> : null}
                    </form>
                </div>
            )}

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2>Ledger Entries</h2>
                </div>
                {entries.length === 0 ? (
                    <div className={styles.empty}>
                        <h3>No payments yet</h3>
                        <p>Ledger entries will appear here once orders are paid.</p>
                    </div>
                ) : (
                    <div className={styles.tableCard}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Order</th>
                                    <th>Gross</th>
                                    <th>Commission</th>
                                    <th>Gateway Fee</th>
                                    <th>Delivery</th>
                                    <th>Net</th>
                                    <th>Refund</th>
                                    <th title="Whether this order's net amount has been paid out to the store">
                                        Payout to store
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry._id}>
                                        <td>{formatOrderDate(entry.createdAt)}</td>
                                        <td>
                                            <Link
                                                className={styles.orderLink}
                                                to={`/admin/tenants/${tenantId}/orders/${entry.orderId}`}
                                            >
                                                {formatOrderRef(entry)}
                                            </Link>
                                        </td>
                                        <td>{formatOrderAmount(entry.grossAmount)}</td>
                                        <td>{formatOrderAmount(entry.commissionAmount)}</td>
                                        <td>{formatOrderAmount(entry.gatewayFee)}</td>
                                        <td>
                                            {entry.deliveryChargeSynced ? (
                                                formatOrderAmount(entry.deliveryCharge)
                                            ) : (
                                                <>
                                                    <span className={styles.deliveryPending}>Pending</span>
                                                    <button
                                                        type="button"
                                                        className={styles.syncButton}
                                                        disabled={syncingOrderId === entry.orderId}
                                                        onClick={() => handleSyncDeliveryCharge(entry.orderId)}
                                                        title="Sync delivery charge"
                                                    >
                                                        {syncingOrderId === entry.orderId ? "Syncing..." : "Sync"}
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                        <td>{formatOrderAmount(entry.netAmount)}</td>
                                        <td>
                                            {refundLabel(entry) ? (
                                                <span
                                                    className={`${styles.status} ${styles.status_refunded}`}
                                                    title={`${formatOrderAmount(entry.refundedAmount)} refunded to the customer`}
                                                >
                                                    {refundLabel(entry)}
                                                </span>
                                            ) : (
                                                <span className={styles.noRefund}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`${styles.status} ${styles[`settled_${entry.settled}`]}`}>
                                                {entry.settled ? "Paid out" : "Not yet paid"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {syncMessage ? <p className={styles.syncMessage}>{syncMessage}</p> : null}
                        <div className={styles.pagination}>
                            <span>
                                Page {statement?.page ?? statementPage} of {statementTotalPages}
                            </span>
                            <button
                                type="button"
                                className={styles.pageButton}
                                disabled={statementPage <= 1}
                                onClick={() => setStatementPage((page) => Math.max(1, page - 1))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className={styles.pageButton}
                                disabled={statementPage >= statementTotalPages}
                                onClick={() => setStatementPage((page) => page + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2>Payouts</h2>
                </div>
                {isPayoutsLoading ? (
                    <div className={styles.state}>Loading payouts...</div>
                ) : isPayoutsError ? (
                    <div className={styles.state}>Failed to load payouts.</div>
                ) : payouts.length === 0 ? (
                    <div className={styles.empty}>
                        <h3>No payouts yet</h3>
                        <p>Payouts recorded for this store will appear here.</p>
                    </div>
                ) : (
                    <div className={styles.tableCard}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Amount</th>
                                    <th>Orders</th>
                                    <th>Note</th>
                                    <th>Recorded By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payouts.map((payout) => (
                                    <tr key={payout._id}>
                                        <td>{formatOrderDate(payout.createdAt)}</td>
                                        <td>{formatOrderAmount(payout.amount)}</td>
                                        <td>{payout.entryCount ?? "-"}</td>
                                        <td>{payout.note || "-"}</td>
                                        <td>{payout.recordedByName || "Platform admin"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className={styles.pagination}>
                            <span>
                                Page {payoutsData?.page ?? payoutsPage} of {payoutsTotalPages}
                            </span>
                            <button
                                type="button"
                                className={styles.pageButton}
                                disabled={payoutsPage <= 1}
                                onClick={() => setPayoutsPage((page) => Math.max(1, page - 1))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className={styles.pageButton}
                                disabled={payoutsPage >= payoutsTotalPages}
                                onClick={() => setPayoutsPage((page) => page + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
