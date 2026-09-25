import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../../constants/queryKeys";
import {
    STOCK_SOURCE_LABELS,
    adjustStock,
    getStockMovements,
} from "../api/stock.api";
import styles from "../styles/StockAdjustModal.module.css";

type Variant = {
    variantId?: string;
    color?: string;
    size?: string;
    stock?: number;
};

type Props = {
    tenantId: string;
    productId: string;
    productName: string;
    inventory: Variant[];
    onClose: () => void;
};

// Fallback if the history request hasn't returned the server's list yet.
const DEFAULT_REASONS: Record<string, string> = {
    received: "Received new stock",
    count_correction: "Stock count correction",
    damaged: "Damaged",
    lost: "Lost or stolen",
    returned_offline: "Returned (offline)",
    sold_offline: "Sold offline",
    other: "Other",
};

// Reasons that usually remove stock start the form on "Remove".
const REMOVE_REASONS = new Set(["damaged", "lost", "sold_offline"]);

const variantLabel = (variant: { color?: string | null; size?: string | null; variantId?: string }) =>
    [variant.color, variant.size].filter(Boolean).join(" / ") || variant.variantId || "Default";

const errorMessage = (error: unknown): string => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : "Could not update stock. Please try again.";
};

export default function StockAdjustModal({ tenantId, productId, productName, inventory, onClose }: Props) {
    const queryClient = useQueryClient();
    const variants = useMemo(
        () => inventory.filter((item): item is Variant & { variantId: string } => Boolean(item.variantId)),
        [inventory],
    );
    const [variantId, setVariantId] = useState(variants[0]?.variantId ?? "");
    const [direction, setDirection] = useState<"add" | "remove">("add");
    const [quantity, setQuantity] = useState("");
    const [reason, setReason] = useState("received");
    const [note, setNote] = useState("");
    const [message, setMessage] = useState("");

    const historyKey = ["admin-stock-movements", tenantId, productId];
    const historyQuery = useQuery({
        queryKey: historyKey,
        queryFn: () => getStockMovements(productId, tenantId),
    });
    const reasons = Object.keys(historyQuery.data?.reasons ?? {}).length
        ? historyQuery.data!.reasons
        : DEFAULT_REASONS;

    // Stock shown in the form follows the latest adjustment made here.
    const [stockOverride, setStockOverride] = useState<Record<string, number>>({});
    const currentStock =
        stockOverride[variantId] ??
        Number(variants.find((item) => item.variantId === variantId)?.stock ?? 0);

    const amount = Math.floor(Number(quantity));
    const validAmount = Number.isFinite(amount) && amount > 0;
    const change = direction === "add" ? amount : -amount;
    const tooMuch = direction === "remove" && validAmount && amount > currentStock;
    const needsNote = reason === "other" && !note.trim();
    const canSubmit = Boolean(variantId) && validAmount && !tooMuch && !needsNote;

    const mutation = useMutation({
        mutationFn: () =>
            adjustStock(productId, {
                tenantId,
                variantId,
                change,
                reason,
                note: note.trim() || undefined,
            }),
        onSuccess: (result) => {
            setStockOverride((prev) => ({ ...prev, [result.variantId]: result.stock }));
            setQuantity("");
            setNote("");
            setMessage(`Saved. ${variantLabel(variants.find((v) => v.variantId === result.variantId) ?? {})} now has ${result.stock} in stock.`);
            queryClient.invalidateQueries({ queryKey: historyKey });
            queryClient.invalidateQueries({ queryKey: ["admin-products", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["tenant-products", tenantId] });
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PRODUCTS] });
        },
        onError: () => setMessage(""),
    });

    const chooseReason = (next: string) => {
        setReason(next);
        setDirection(REMOVE_REASONS.has(next) ? "remove" : "add");
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (canSubmit && !mutation.isPending) {
            setMessage("");
            mutation.mutate();
        }
    };

    return (
        <div
            className={styles.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="stock-adjust-title">
                <div className={styles.header}>
                    <div>
                        <span className={styles.eyebrow}>Stock</span>
                        <h2 id="stock-adjust-title">{productName}</h2>
                    </div>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className={styles.body}>
                    {variants.length === 0 ? (
                        <p className={styles.empty}>
                            This product has no variants yet. Add colours and sizes in Edit first.
                        </p>
                    ) : (
                        <form className={styles.form} onSubmit={submit}>
                            <label className={styles.field}>
                                <span>Variant</span>
                                <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                                    {variants.map((variant) => (
                                        <option key={variant.variantId} value={variant.variantId}>
                                            {variantLabel(variant)} ({stockOverride[variant.variantId] ?? variant.stock ?? 0} in stock)
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className={styles.field}>
                                <span>Reason</span>
                                <select value={reason} onChange={(event) => chooseReason(event.target.value)}>
                                    {Object.entries(reasons).map(([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className={styles.field}>
                                <span>Change</span>
                                <div className={styles.changeRow}>
                                    <div className={styles.toggle} role="group" aria-label="Add or remove stock">
                                        <button
                                            type="button"
                                            className={direction === "add" ? styles.toggleActive : ""}
                                            onClick={() => setDirection("add")}
                                        >
                                            + Add
                                        </button>
                                        <button
                                            type="button"
                                            className={direction === "remove" ? styles.toggleActive : ""}
                                            onClick={() => setDirection("remove")}
                                        >
                                            − Remove
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        inputMode="numeric"
                                        value={quantity}
                                        onChange={(event) => setQuantity(event.target.value)}
                                        placeholder="Quantity"
                                        aria-label="Quantity"
                                    />
                                </div>
                                <small className={styles.hint}>
                                    Now {currentStock}
                                    {validAmount && !tooMuch ? ` → ${currentStock + change}` : ""}
                                </small>
                                {tooMuch ? (
                                    <small className={styles.error}>Only {currentStock} in stock.</small>
                                ) : null}
                            </div>

                            <label className={styles.field}>
                                <span>Note {reason === "other" ? "(required)" : "(optional)"}</span>
                                <input
                                    type="text"
                                    maxLength={200}
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder="e.g. PO-1043 from supplier"
                                />
                            </label>

                            {mutation.isError ? <p className={styles.error}>{errorMessage(mutation.error)}</p> : null}
                            {message ? <p className={styles.success}>{message}</p> : null}

                            <div className={styles.actions}>
                                <button type="button" className={styles.secondary} onClick={onClose}>
                                    Close
                                </button>
                                <button type="submit" className={styles.primary} disabled={!canSubmit || mutation.isPending}>
                                    {mutation.isPending ? "Saving…" : "Save adjustment"}
                                </button>
                            </div>
                        </form>
                    )}

                    <section className={styles.history}>
                        <h3>Stock history</h3>
                        {historyQuery.isLoading ? (
                            <p className={styles.muted}>Loading…</p>
                        ) : historyQuery.isError ? (
                            <p className={styles.error}>Could not load stock history.</p>
                        ) : !historyQuery.data?.data.length ? (
                            <p className={styles.muted}>No stock changes recorded yet.</p>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Variant</th>
                                            <th>Change</th>
                                            <th>After</th>
                                            <th>Why</th>
                                            <th>By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyQuery.data.data.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    {new Date(row.createdAt).toLocaleString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </td>
                                                <td>{variantLabel(row)}</td>
                                                <td className={row.change > 0 ? styles.plus : styles.minus}>
                                                    {row.change > 0 ? `+${row.change}` : row.change}
                                                </td>
                                                <td>{row.stockAfter ?? "—"}</td>
                                                <td>
                                                    {STOCK_SOURCE_LABELS[row.source] ?? row.source}
                                                    {row.reasonLabel ? `: ${row.reasonLabel}` : ""}
                                                    {row.note ? <span className={styles.note}>{row.note}</span> : null}
                                                </td>
                                                <td>{row.userName || (row.orderId ? "Order" : "System")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
