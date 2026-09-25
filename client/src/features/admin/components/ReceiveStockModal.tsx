import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../../constants/queryKeys";
import { useCategory } from "../../products/hooks/useCategory";
import {
    commitReceiving,
    previewReceiving,
    productIdOf,
    receivingError,
    searchReceivingProducts,
    type ReceivingCommitResult,
    type ReceivingError,
    type ReceivingLine,
    type ReceivingPreview,
    type ReceivingPreviewPayload,
    type ReceivingProduct,
} from "../api/receiving.api";
import { ReceivingPreviewTable, ReceivingResultTable } from "./ReceivingTables";
import shell from "../styles/StockAdjustModal.module.css";
import styles from "../styles/ReceiveStockModal.module.css";

type Props = {
    tenantId: string;
    /** Opened from a product row: that product is already selected. */
    initialProduct?: ReceivingProduct | null;
    onClose: () => void;
};

type Step = "choose" | "enter" | "preview" | "done";
type Mode = "existing" | "new";
type NewRow = { key: number; color: string; size: string; qty: string };
type Category = { categoryId: string; name: string };

// Same bounds the backend enforces (MAX_ADJUSTMENT).
const MAX_INCOMING = 100000;
const STEP_LABELS: Array<[Step, string]> = [
    ["choose", "Product"],
    ["enter", "Quantities"],
    ["preview", "Preview"],
    ["done", "Done"],
];

const normalize = (value: string | undefined) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const variantLabel = (item: { color?: string | null; size?: string | null }) =>
    [item.color, item.size].filter(Boolean).join(" / ") || "Default";

/** A quantity the admin typed: blank = not receiving, otherwise a whole number 0–100000. */
function parseQuantity(raw: string): { value: number | null; valid: boolean } {
    const text = raw.trim();
    if (!text) {
        return { value: null, valid: true };
    }
    if (!/^\d+$/.test(text)) {
        return { value: null, valid: false };
    }
    const value = Number(text);
    return { value, valid: value <= MAX_INCOMING };
}

export default function ReceiveStockModal({ tenantId, initialProduct = null, onClose }: Props) {
    const queryClient = useQueryClient();
    const [step, setStep] = useState<Step>(initialProduct ? "enter" : "choose");
    const [mode, setMode] = useState<Mode>("existing");
    const [product, setProduct] = useState<ReceivingProduct | null>(initialProduct);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const [existingQty, setExistingQty] = useState<Record<string, string>>({});
    const [newRows, setNewRows] = useState<NewRow[]>([]);
    const nextRowKey = useRef(1);
    const [name, setName] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [brand, setBrand] = useState("");
    const [formError, setFormError] = useState("");

    const [preview, setPreview] = useState<ReceivingPreview | null>(null);
    const [lastPayload, setLastPayload] = useState<ReceivingPreviewPayload | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [highlightConfirm, setHighlightConfirm] = useState(false);
    const [note, setNote] = useState("");
    const [error, setError] = useState<ReceivingError | null>(null);
    const [result, setResult] = useState<ReceivingCommitResult | null>(null);
    const committing = useRef(false);

    const searchQuery = useQuery({
        queryKey: ["receiving-product-search", tenantId, search],
        queryFn: () => searchReceivingProducts(tenantId, search),
        enabled: step === "choose" && mode === "existing" && Boolean(tenantId),
    });

    const { data: categoryResponse } = useCategory(mode === "new" ? tenantId : "");
    const categories = useMemo<Category[]>(() => {
        const list = (categoryResponse as { data?: unknown } | undefined)?.data;
        if (!Array.isArray(list)) {
            return [];
        }
        return list
            .map((item: { categoryId?: string; _id?: string; name?: string }) => ({
                categoryId: String(item.categoryId || item._id || ""),
                name: String(item.name || item.categoryId || item._id || ""),
            }))
            .filter((item) => item.categoryId && item.name);
    }, [categoryResponse]);

    const variants = useMemo(
        () => (product?.inventory || []).filter((item) => Boolean(item.variantId)),
        [product],
    );

    const previewMutation = useMutation({
        mutationFn: previewReceiving,
        onSuccess: (data) => {
            setPreview(data);
            setConfirmed(false);
            setHighlightConfirm(false);
            setError(null);
            setStep("preview");
        },
        onError: (err) => setError(receivingError(err)),
    });

    const commitMutation = useMutation({
        mutationFn: commitReceiving,
        onSuccess: (data) => {
            setResult(data);
            setError(null);
            setStep("done");
            queryClient.invalidateQueries({ queryKey: ["admin-products", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["tenant-products", tenantId] });
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PRODUCTS] });
            queryClient.invalidateQueries({ queryKey: ["admin-low-stock", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["admin-stock-movements", tenantId, data.productId] });
        },
        onError: (err) => {
            const next = receivingError(err);
            setError(next);
            if (next.kind === "confirmation_required") {
                setHighlightConfirm(true);
            }
        },
    });

    const busy = previewMutation.isPending || commitMutation.isPending;

    const selectProduct = (next: ReceivingProduct) => {
        setProduct(next);
        setExistingQty({});
        setNewRows([]);
        setFormError("");
        setError(null);
        setStep("enter");
    };

    const startNewProduct = () => {
        setMode("new");
        setProduct(null);
        setNewRows([{ key: nextRowKey.current++, color: "", size: "", qty: "" }]);
        setFormError("");
        setError(null);
        setStep("enter");
    };

    const backToChoose = () => {
        setMode("existing");
        setProduct(null);
        setPreview(null);
        setError(null);
        setFormError("");
        setStep("choose");
    };

    const addRow = () => setNewRows((rows) => [...rows, { key: nextRowKey.current++, color: "", size: "", qty: "" }]);
    const updateRow = (key: number, field: keyof Omit<NewRow, "key">, value: string) =>
        setNewRows((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    const removeRow = (key: number) => setNewRows((rows) => rows.filter((row) => row.key !== key));

    /** Build the preview request from what the admin typed, or explain what's wrong. */
    const buildPayload = (): ReceivingPreviewPayload | string => {
        const lines: ReceivingLine[] = [];
        if (mode === "existing") {
            for (const variant of variants) {
                const parsed = parseQuantity(existingQty[variant.variantId!] || "");
                if (!parsed.valid) {
                    return `Incoming stock for ${variantLabel(variant)} must be a whole number from 0 to ${MAX_INCOMING}.`;
                }
                if (parsed.value) {
                    lines.push({ variantId: variant.variantId, incomingStock: parsed.value });
                }
            }
        }
        const seen = new Set(variants.map((variant) => `${normalize(variant.color)}|${normalize(variant.size)}`));
        for (const row of newRows) {
            if (!row.color.trim() && !row.size.trim() && !row.qty.trim()) {
                continue;
            }
            const label = variantLabel({ color: row.color.trim(), size: row.size.trim() });
            if (!row.color.trim() || !row.size.trim()) {
                return "Each new variant needs a colour and a size.";
            }
            const parsed = parseQuantity(row.qty);
            if (!parsed.valid) {
                return `Incoming stock for ${label} must be a whole number from 0 to ${MAX_INCOMING}.`;
            }
            if (!parsed.value) {
                return `Enter the incoming stock for ${label}.`;
            }
            const key = `${normalize(row.color)}|${normalize(row.size)}`;
            if (seen.has(key)) {
                return mode === "existing" && variants.some((v) => `${normalize(v.color)}|${normalize(v.size)}` === key)
                    ? `${label} already exists on this product. Enter it in the table above.`
                    : `${label} is listed twice.`;
            }
            seen.add(key);
            lines.push({ color: row.color.trim(), size: row.size.trim(), incomingStock: parsed.value });
        }
        if (mode === "new") {
            if (!name.trim()) {
                return "Enter the product name.";
            }
            if (!categoryId) {
                return "Choose a category.";
            }
        }
        if (!lines.length) {
            return "Enter at least one incoming quantity.";
        }
        if (mode === "existing") {
            return { tenantId, productId: productIdOf(product!), variants: lines };
        }
        const category = categories.find((item) => item.categoryId === categoryId);
        return {
            tenantId,
            name: name.trim(),
            categoryId,
            categoryName: category?.name,
            brand: brand.trim() || undefined,
            variants: lines,
        };
    };

    const requestPreview = (payload: ReceivingPreviewPayload) => {
        setLastPayload(payload);
        previewMutation.mutate(payload);
    };

    const submitQuantities = (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) {
            return;
        }
        const payload = buildPayload();
        if (typeof payload === "string") {
            setFormError(payload);
            return;
        }
        setFormError("");
        requestPreview(payload);
    };

    const refreshPreview = () => {
        if (lastPayload && !busy) {
            requestPreview(lastPayload);
        }
    };

    // A name + category match: preview again against that product, with the same lines.
    const chooseCandidate = () => {
        if (!preview?.product.id || !lastPayload || busy) {
            return;
        }
        setMode("existing");
        setProduct({ _id: preview.product.id, name: preview.product.name || "", categoryId: preview.product.categoryId || undefined });
        requestPreview({ tenantId, productId: preview.product.id, variants: lastPayload.variants });
    };

    const needsConfirmation = Boolean(preview?.requiresConfirmation);
    const canCommit = Boolean(preview?.previewToken) && (!needsConfirmation || confirmed) && !busy;

    const confirmReceiving = () => {
        // The ref blocks a second click in the same tick, before React re-renders.
        if (committing.current || !canCommit || !preview?.previewToken) {
            return;
        }
        committing.current = true;
        setError(null);
        commitMutation.mutate(
            { previewToken: preview.previewToken, confirm: confirmed, note },
            { onSettled: () => { committing.current = false; } },
        );
    };

    const receiveMore = () => {
        setResult(null);
        setPreview(null);
        setLastPayload(null);
        setNote("");
        setExistingQty({});
        setNewRows([]);
        setName("");
        setCategoryId("");
        setBrand("");
        backToChoose();
    };

    const close = () => {
        if (!commitMutation.isPending) {
            onClose();
        }
    };

    const isNewProductPreview = preview?.action === "NEW_PRODUCT";

    return (
        <div
            className={shell.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
        >
            <div className={`${shell.modal} ${styles.wide}`} role="dialog" aria-modal="true" aria-labelledby="receive-stock-title">
                <div className={shell.header}>
                    <div>
                        <span className={shell.eyebrow}>Receive stock</span>
                        <h2 id="receive-stock-title">
                            {mode === "new" ? name.trim() || "New product" : product?.name || "Choose a product"}
                        </h2>
                    </div>
                    <button type="button" className={shell.close} onClick={close} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className={`${shell.body} ${styles.stack}`}>
                    <ol className={styles.steps}>
                        {STEP_LABELS.map(([key, label]) => (
                            <li key={key} className={step === key ? styles.stepActive : undefined}>
                                {label}
                            </li>
                        ))}
                    </ol>

                    {step === "choose" ? (
                        <>
                            <label className={shell.field}>
                                <span>Search products</span>
                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                    placeholder="Product name"
                                    aria-label="Search products"
                                    autoFocus
                                />
                            </label>
                            {searchQuery.isLoading ? (
                                <p className={shell.muted}>Searching…</p>
                            ) : searchQuery.isError ? (
                                <p className={shell.error}>Could not load products.</p>
                            ) : !searchQuery.data?.length ? (
                                <p className={shell.muted}>No products found.</p>
                            ) : (
                                <ul className={styles.results} aria-label="Products">
                                    {searchQuery.data.map((item) => (
                                        <li key={productIdOf(item)}>
                                            <button type="button" onClick={() => selectProduct(item)}>
                                                <span>
                                                    {item.name}
                                                    {item.isDraft ? <span className={styles.badge}>Draft</span> : null}
                                                </span>
                                                <span className={styles.meta}>
                                                    {(item.inventory || []).length} variant(s)
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className={styles.footer}>
                                <button type="button" className={shell.secondary} onClick={startNewProduct}>
                                    Receive a new product
                                </button>
                            </div>
                        </>
                    ) : null}

                    {step === "enter" ? (
                        <form className={styles.stack} onSubmit={submitQuantities} noValidate>
                            {mode === "existing" && product ? (
                                <>
                                    <div className={styles.selected}>
                                        <span>
                                            <strong>{product.name}</strong>
                                            {product.isDraft ? <span className={styles.badge}>Draft</span> : null}
                                        </span>
                                        <button type="button" className={styles.linkButton} onClick={backToChoose}>
                                            Change product
                                        </button>
                                    </div>
                                    {variants.length ? (
                                        <div className={shell.tableWrap}>
                                            <table className={shell.table} aria-label="Incoming stock">
                                                <thead>
                                                    <tr>
                                                        <th>SKU</th>
                                                        <th>Variant</th>
                                                        <th className={styles.num}>In stock now</th>
                                                        <th>Incoming</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {variants.map((variant) => (
                                                        <tr key={variant.variantId}>
                                                            <td className={styles.sku}>{variant.variantId}</td>
                                                            <td>{variantLabel(variant)}</td>
                                                            <td className={styles.num}>{variant.stock ?? 0}</td>
                                                            <td>
                                                                <input
                                                                    className={styles.qty}
                                                                    type="number"
                                                                    min={0}
                                                                    step={1}
                                                                    inputMode="numeric"
                                                                    value={existingQty[variant.variantId!] || ""}
                                                                    onChange={(event) =>
                                                                        setExistingQty((prev) => ({ ...prev, [variant.variantId!]: event.target.value }))
                                                                    }
                                                                    aria-label={`Incoming for ${variantLabel(variant)}`}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className={shell.muted}>This product has no variants yet. Add them as new variants below.</p>
                                    )}
                                </>
                            ) : null}

                            {mode === "new" ? (
                                <>
                                    <p className={shell.muted}>
                                        The product is saved as a hidden draft at price 0. Set its price and publish it
                                        from Products afterwards.
                                    </p>
                                    <div className={styles.grid2}>
                                        <label className={shell.field}>
                                            <span>Product name</span>
                                            <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
                                        </label>
                                        <label className={shell.field}>
                                            <span>Category</span>
                                            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                                                <option value="">Select a category</option>
                                                {categories.map((item) => (
                                                    <option key={item.categoryId} value={item.categoryId}>
                                                        {item.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className={shell.field}>
                                            <span>Brand (optional)</span>
                                            <input value={brand} maxLength={120} onChange={(event) => setBrand(event.target.value)} />
                                        </label>
                                    </div>
                                    <p className={styles.meta}>
                                        {categories.length
                                            ? "Category not listed? Receiving never creates categories. Create it first by adding a product in it (Add Product), then receive stock here."
                                            : "This store has no categories yet. Receiving never creates categories. Create one first by adding a product in it (Add Product), then receive stock here."}
                                    </p>
                                </>
                            ) : null}

                            <div className={styles.stack}>
                                <strong>{mode === "existing" ? "New colours / sizes (optional)" : "Variants"}</strong>
                                {newRows.map((row, index) => (
                                    <div key={row.key} className={styles.grid2}>
                                        <input
                                            className={styles.textInput}
                                            value={row.color}
                                            maxLength={100}
                                            onChange={(event) => updateRow(row.key, "color", event.target.value)}
                                            placeholder="Colour"
                                            aria-label={`New variant ${index + 1} colour`}
                                        />
                                        <input
                                            className={styles.textInput}
                                            value={row.size}
                                            maxLength={100}
                                            onChange={(event) => updateRow(row.key, "size", event.target.value)}
                                            placeholder="Size"
                                            aria-label={`New variant ${index + 1} size`}
                                        />
                                        <div className={shell.changeRow}>
                                            <input
                                                className={styles.qty}
                                                type="number"
                                                min={0}
                                                step={1}
                                                inputMode="numeric"
                                                value={row.qty}
                                                onChange={(event) => updateRow(row.key, "qty", event.target.value)}
                                                placeholder="Incoming"
                                                aria-label={`New variant ${index + 1} incoming`}
                                            />
                                            <button type="button" className={styles.linkButton} onClick={() => removeRow(row.key)}>
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div>
                                    <button type="button" className={styles.linkButton} onClick={addRow}>
                                        + Add a colour / size
                                    </button>
                                </div>
                            </div>

                            {formError ? <p className={shell.error} role="alert">{formError}</p> : null}
                            {error ? <p className={shell.error} role="alert">{error.message}</p> : null}

                            <div className={styles.footer}>
                                <button type="button" className={shell.secondary} onClick={initialProduct ? close : backToChoose}>
                                    {initialProduct ? "Cancel" : "Back"}
                                </button>
                                <button type="submit" className={shell.primary} disabled={busy}>
                                    {previewMutation.isPending ? "Checking…" : "Preview"}
                                </button>
                            </div>
                        </form>
                    ) : null}

                    {step === "preview" && preview ? (
                        <>
                            {isNewProductPreview ? (
                                <p className={shell.muted}>
                                    New product <strong>{preview.product.name}</strong> in {preview.category.categoryName}. It
                                    will be saved as a hidden draft at price 0.
                                </p>
                            ) : (
                                <p className={shell.muted}>
                                    Adding stock to <strong>{preview.product.name}</strong>.
                                </p>
                            )}

                            <ReceivingPreviewTable preview={preview} />

                            {preview.warnings.length ? (
                                <ul className={styles.warnings} aria-label="Warnings">
                                    {preview.warnings.map((warning) => (
                                        <li key={warning}>{warning}</li>
                                    ))}
                                </ul>
                            ) : null}

                            {!preview.previewToken ? (
                                <div className={styles.confirm} role="alert">
                                    <span>
                                        This matches the existing product <strong>{preview.product.name}</strong>. Choose it
                                        to add the stock there; a duplicate product is never created from a match.
                                    </span>
                                    <button type="button" className={shell.primary} onClick={chooseCandidate} disabled={busy}>
                                        Use this product
                                    </button>
                                </div>
                            ) : null}

                            {preview.previewToken && needsConfirmation ? (
                                <label className={`${styles.confirm} ${highlightConfirm ? styles.confirmHighlight : ""}`}>
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        onChange={(event) => setConfirmed(event.target.checked)}
                                    />
                                    <span>I have checked the warnings above and confirm this receiving.</span>
                                </label>
                            ) : null}

                            {preview.previewToken ? (
                                <label className={shell.field}>
                                    <span>Note (optional)</span>
                                    <input
                                        value={note}
                                        maxLength={200}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="e.g. Invoice 1043 from supplier"
                                    />
                                </label>
                            ) : null}

                            {error ? <p className={shell.error} role="alert">{error.message}</p> : null}

                            <div className={styles.footer}>
                                <button
                                    type="button"
                                    className={shell.secondary}
                                    onClick={() => {
                                        setError(null);
                                        setStep("enter");
                                    }}
                                    disabled={busy}
                                >
                                    Back
                                </button>
                                {error?.kind === "stale" ? (
                                    <button type="button" className={shell.secondary} onClick={refreshPreview} disabled={busy}>
                                        {previewMutation.isPending ? "Refreshing…" : "Refresh preview"}
                                    </button>
                                ) : null}
                                {preview.previewToken ? (
                                    <button type="button" className={shell.primary} onClick={confirmReceiving} disabled={!canCommit}>
                                        {commitMutation.isPending ? "Saving…" : "Confirm receiving"}
                                    </button>
                                ) : null}
                            </div>
                        </>
                    ) : null}

                    {step === "done" && result ? (
                        <>
                            <p className={shell.success} role="status">
                                {result.replayed
                                    ? "This receiving was already saved. Showing the original result."
                                    : result.action === "PRODUCT_CREATED"
                                      ? "Stock received. The new product is saved as a hidden draft at price 0; set its price and publish it from Products."
                                      : "Stock received."}
                            </p>
                            <ReceivingResultTable result={result} />
                            <div className={styles.footer}>
                                <button type="button" className={shell.secondary} onClick={receiveMore}>
                                    Receive more
                                </button>
                                <button type="button" className={shell.primary} onClick={onClose}>
                                    Done
                                </button>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
