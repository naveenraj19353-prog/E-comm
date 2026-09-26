import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { getTenantByTenantId } from "../api/tenant.api";
import {
    saveCategoryRate,
    saveTaxSettings,
    type CategoryRateRow,
    type TaxSettingsPayload,
} from "../api/tax.api";
import { getCategory } from "../../products/api/product.api";
import { GST_RATES, GST_RATE_LABELS } from "../../../utils/gst";
import { GST_STATES } from "../../../constants/gstStates";
import { useAlert } from "../../../components/Modal";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/AdminTenantTax.module.css";

function errorMessage(err: unknown, fallback: string) {
    if (!axios.isAxiosError(err)) {
        return fallback;
    }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") {
        return detail;
    }
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg).filter(Boolean).join("\n") || fallback;
    }
    return fallback;
}

const DEFAULTS: TaxSettingsPayload = {
    pricesIncludeTax: true,
    compositionScheme: false,
    defaultGstRate: 0,
    stateCode: null,
    freightTaxable: true,
    roundInvoiceToRupee: true,
    invoicePrefix: null,
};

const AdminTenantTax = () => {
    const { tenantId = "" } = useParams();
    const { showAlert } = useAlert();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
    const [tenantMongoId, setTenantMongoId] = useState("");
    const [gstinState, setGstinState] = useState<string | null>(null);
    const [form, setForm] = useState<TaxSettingsPayload>(DEFAULTS);
    const [categories, setCategories] = useState<CategoryRateRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const tenant = await getTenantByTenantId(tenantId);
                if (cancelled) {
                    return;
                }
                const tax = (tenant as { tax?: Partial<TaxSettingsPayload> }).tax;
                setTenantMongoId(String((tenant as { _id?: string })._id || ""));
                setGstinState(
                    (tenant as { businessDetails?: { state?: string } })
                        ?.businessDetails?.state ?? null,
                );
                setForm({
                    ...DEFAULTS,
                    ...(tax || {}),
                    stateCode: tax?.stateCode ?? null,
                    invoicePrefix: tax?.invoicePrefix ?? null,
                });

                const response = await getCategory(tenantId);
                if (cancelled) {
                    return;
                }
                const list = (response?.data ?? []) as Array<{
                    _id?: string;
                    id?: string;
                    name?: string;
                    defaultGstRate?: number | null;
                }>;
                setCategories(
                    list
                        .map((item) => ({
                            id: String(item._id || item.id || ""),
                            name: String(item.name || "Category"),
                            defaultGstRate:
                                item.defaultGstRate === null ||
                                item.defaultGstRate === undefined
                                    ? null
                                    : Number(item.defaultGstRate),
                        }))
                        .filter((item) => item.id),
                );
            } catch (error) {
                if (!cancelled) {
                    showAlert(errorMessage(error, "Could not load tax settings."), {
                        tone: "danger",
                    });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        if (tenantId) {
            void load();
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const taxableNow = useMemo(
        () => form.defaultGstRate > 0 || categories.some((row) => row.defaultGstRate),
        [form.defaultGstRate, categories],
    );

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        if (!tenantMongoId) {
            showAlert("Could not identify the store to save against.", {
                tone: "danger",
            });
            return;
        }
        setSaving(true);
        try {
            await saveTaxSettings(tenantMongoId, {
                ...form,
                stateCode: form.stateCode || null,
                invoicePrefix: form.invoicePrefix?.trim() || null,
            });
            showAlert("Tax settings saved.", { tone: "success" });
        } catch (error) {
            showAlert(errorMessage(error, "Could not save tax settings."), {
                tone: "danger",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCategoryRate = async (row: CategoryRateRow, value: string) => {
        setSavingCategoryId(row.id);
        const rate = value === "" ? null : Number(value);
        try {
            await saveCategoryRate(row.id, tenantId, rate);
            setCategories((current) =>
                current.map((item) =>
                    item.id === row.id ? { ...item, defaultGstRate: rate } : item,
                ),
            );
        } catch (error) {
            showAlert(errorMessage(error, "Could not save the category rate."), {
                tone: "danger",
            });
        } finally {
            setSavingCategoryId(null);
        }
    };

    if (loading) {
        return <PageLoader message="Loading tax settings..." />;
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>Tax &amp; GST</h1>
                <p>
                    How this store prices and charges GST. Nothing is taxed until a
                    rate is set here, on a category, or on a product.
                </p>
            </header>

            {!taxableNow && (
                <p className={styles.notice}>
                    No rate is set anywhere yet, so no GST is being charged and
                    customer totals are unchanged.
                </p>
            )}

            <form className={styles.card} onSubmit={handleSave}>
                <h2>Pricing</h2>

                <div className={styles.field}>
                    <label htmlFor="pricingBasis">Are your prices tax-inclusive?</label>
                    <select
                        id="pricingBasis"
                        value={form.pricesIncludeTax ? "inclusive" : "exclusive"}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                pricesIncludeTax: event.target.value === "inclusive",
                            })
                        }
                    >
                        <option value="inclusive">
                            Yes â€” the listed price already includes GST
                        </option>
                        <option value="exclusive">
                            No â€” add GST on top of the listed price
                        </option>
                    </select>
                    <small>
                        {form.pricesIncludeTax
                            ? "The customer pays the listed price; GST is reported as a split of it."
                            : "GST is added at checkout, so the customer pays more than the listed price."}
                    </small>
                </div>

                <div className={styles.field}>
                    <label htmlFor="defaultRate">Default GST rate</label>
                    <select
                        id="defaultRate"
                        value={String(form.defaultGstRate)}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                defaultGstRate: Number(event.target.value),
                            })
                        }
                    >
                        {GST_RATES.map((rate) => (
                            <option key={rate} value={String(rate)}>
                                {GST_RATE_LABELS[String(rate)] ?? `${rate}%`}
                            </option>
                        ))}
                    </select>
                    <small>
                        Used only when neither the product nor its category sets a rate.
                    </small>
                </div>

                <div className={styles.field}>
                    <label htmlFor="stateCode">Store state (place of supply origin)</label>
                    <select
                        id="stateCode"
                        value={form.stateCode ?? ""}
                        onChange={(event) =>
                            setForm({ ...form, stateCode: event.target.value || null })
                        }
                    >
                        <option value="">
                            Derive from GSTIN / business details
                        </option>
                        {GST_STATES.map((state) => (
                            <option key={state.code} value={state.code}>
                                {state.code} â€” {state.name}
                            </option>
                        ))}
                    </select>
                    <small>
                        Decides whether an order is billed as CGST+SGST or IGST.
                        {gstinState ? ` Business state on file: ${gstinState}.` : ""}
                        {!form.stateCode && !gstinState
                            ? " No state could be derived, so every sale is treated as within-state."
                            : ""}
                    </small>
                </div>

                <label className={styles.check}>
                    <input
                        type="checkbox"
                        checked={form.freightTaxable}
                        onChange={(event) =>
                            setForm({ ...form, freightTaxable: event.target.checked })
                        }
                    />
                    <span>Charge GST on delivery charges</span>
                </label>

                <label className={styles.check}>
                    <input
                        type="checkbox"
                        checked={form.roundInvoiceToRupee}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                roundInvoiceToRupee: event.target.checked,
                            })
                        }
                    />
                    <span>Round the invoice total to the nearest rupee</span>
                </label>

                <label className={styles.check}>
                    <input
                        type="checkbox"
                        checked={form.compositionScheme}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                compositionScheme: event.target.checked,
                            })
                        }
                    />
                    <span>
                        Composition scheme â€” do not collect GST or show a tax split
                    </span>
                </label>

                <div className={styles.field}>
                    <label htmlFor="invoicePrefix">Invoice number prefix</label>
                    <input
                        id="invoicePrefix"
                        value={form.invoicePrefix ?? ""}
                        onChange={(event) =>
                            setForm({
                                ...form,
                                invoicePrefix: event.target.value,
                            })
                        }
                        placeholder="INV"
                    />
                    <small>Optional. Prefixes invoice numbers on tax invoices.</small>
                </div>

                <button type="submit" className={styles.primary} disabled={saving}>
                    {saving ? "Saving..." : "Save tax settings"}
                </button>
            </form>

            <section className={styles.card}>
                <h2>Category rates</h2>
                <p className={styles.hint}>
                    Set a rate once per category instead of on every product. A
                    product's own rate always wins over its category's.
                </p>

                {categories.length === 0 ? (
                    <p className={styles.hint}>No categories yet.</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>GST rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.name}</td>
                                    <td>
                                        <select
                                            value={
                                                row.defaultGstRate === null
                                                    ? ""
                                                    : String(row.defaultGstRate)
                                            }
                                            disabled={savingCategoryId === row.id}
                                            onChange={(event) =>
                                                void handleCategoryRate(
                                                    row,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            <option value="">
                                                Use store default
                                            </option>
                                            {GST_RATES.map((rate) => (
                                                <option
                                                    key={rate}
                                                    value={String(rate)}
                                                >
                                                    {GST_RATE_LABELS[String(rate)] ??
                                                        `${rate}%`}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
};

export default AdminTenantTax;
