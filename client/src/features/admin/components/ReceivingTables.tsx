import type { ReceivingCommitResult, ReceivingPreview } from "../api/receiving.api";
import shell from "../styles/StockAdjustModal.module.css";
import styles from "../styles/ReceiveStockModal.module.css";

// Display only: every number comes from the backend response.

const variantLabel = (row: { color: string | null; size: string | null }) =>
    [row.color, row.size].filter(Boolean).join(" / ") || "—";

const PREVIEW_ACTIONS = {
    ADD_TO_EXISTING_VARIANT: { label: "Stock increase", className: styles.tagAdd },
    CREATE_NEW_VARIANT: { label: "New variant", className: styles.tagNew },
} as const;

const RESULT_ACTIONS = {
    STOCK_INCREASED: { label: "Stock increased", className: styles.tagAdd },
    VARIANT_CREATED: { label: "Variant created", className: styles.tagNew },
    UNCHANGED: { label: "Unchanged", className: styles.tagSame },
} as const;

export function ReceivingPreviewTable({ preview }: { preview: ReceivingPreview }) {
    return (
        <div className={shell.tableWrap}>
            <table className={shell.table} aria-label="Receiving preview">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Variant</th>
                        <th className={styles.num}>Existing</th>
                        <th className={styles.num}>Incoming</th>
                        <th className={styles.num}>Final</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {preview.variants.map((row, index) => {
                        const action = PREVIEW_ACTIONS[row.action];
                        return (
                            <tr key={row.variantId || row.proposedVariantId || index}>
                                <td className={styles.sku}>{row.variantId || row.proposedVariantId || "—"}</td>
                                <td>{variantLabel(row)}</td>
                                <td className={styles.num}>{row.existingStock}</td>
                                <td className={styles.num}>+{row.incomingStock}</td>
                                <td className={styles.num}>{row.finalStock}</td>
                                <td>
                                    <span className={action.className}>{action.label}</span>
                                </td>
                            </tr>
                        );
                    })}
                    <tr className={styles.totals}>
                        <td colSpan={2}>Total</td>
                        <td className={styles.num}>{preview.totals.existingStock}</td>
                        <td className={styles.num}>+{preview.totals.incomingStock}</td>
                        <td className={styles.num}>{preview.totals.finalStock}</td>
                        <td />
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export function ReceivingResultTable({ result }: { result: ReceivingCommitResult }) {
    return (
        <div className={shell.tableWrap}>
            <table className={shell.table} aria-label="Receiving result">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Variant</th>
                        <th className={styles.num}>Before</th>
                        <th className={styles.num}>Received</th>
                        <th className={styles.num}>After</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    {result.variants.map((row) => {
                        const action = RESULT_ACTIONS[row.action];
                        return (
                            <tr key={row.variantId}>
                                <td className={styles.sku}>{row.variantId}</td>
                                <td>{variantLabel(row)}</td>
                                <td className={styles.num}>{row.beforeStock}</td>
                                <td className={styles.num}>+{row.receivedStock}</td>
                                <td className={styles.num}>{row.afterStock}</td>
                                <td>
                                    <span className={action.className}>{action.label}</span>
                                </td>
                            </tr>
                        );
                    })}
                    <tr className={styles.totals}>
                        <td colSpan={2}>Total</td>
                        <td className={styles.num}>{result.totals.beforeStock}</td>
                        <td className={styles.num}>+{result.totals.receivedStock}</td>
                        <td className={styles.num}>{result.totals.afterStock}</td>
                        <td />
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
