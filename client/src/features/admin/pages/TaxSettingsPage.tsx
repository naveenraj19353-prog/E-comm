import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
    emptyTaxProfile,
    getTaxProfile,
    saveTaxProfile,
    type TaxProfile,
} from "../api/tax.api";
import { GST_STATES } from "../../../constants/gstStates";
import { useAlert } from "../../../components/Modal";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/TaxSettings.module.css";

function errorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError(error)) {
        return fallback;
    }
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
        return detail;
    }
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg).filter(Boolean).join("\n") || fallback;
    }
    return fallback;
}

const TaxSettingsPage = () => {
    const { tenantId = "" } = useParams();
    const { showAlert } = useAlert();
    const [form, setForm] = useState<TaxProfile>(emptyTaxProfile(tenantId));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!tenantId) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        getTaxProfile(tenantId)
            .then((profile) => {
                if (!cancelled) {
                    setForm(profile);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    showAlert(errorMessage(error, "Unable to load GST settings."), {
                        tone: "danger",
                    });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const set = <K extends keyof TaxProfile>(key: K, value: TaxProfile[K]) =>
        setForm((previous) => ({ ...previous, [key]: value }));

    const selectState = (code: string) => {
        const row = GST_STATES.find((state) => state.code === code);
        setForm((previous) => ({
            ...previous,
            stateCode: code,
            state: row?.name || "",
        }));
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        // Caught here as well as on the server so the merchant sees it before a
        // round trip: a GSTIN whose first two digits disagree with the chosen
        // state would put the wrong tax on every invoice.
        if (
            form.enabled &&
            form.gstin &&
            form.stateCode &&
            form.gstin.slice(0, 2) !== form.stateCode
        ) {
            showAlert("GSTIN state code must match the selected registered state.", {
                tone: "warning",
            });
            return;
        }
        setSaving(true);
        try {
            setForm(await saveTaxProfile(form));
            showAlert("GST settings saved.", { tone: "success" });
        } catch (error) {
            showAlert(errorMessage(error, "Unable to save GST settings."), {
                tone: "danger",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <PageLoader message="Loading GST settings..." />;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>Tax &amp; GST</h1>
                <p>
                    The GST registration and invoice defaults used for this store.
                    Nothing is taxed until this is enabled.
                </p>
            </div>

            <form className={styles.card} onSubmit={handleSubmit}>
                <label className={styles.toggle}>
                    <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(event) => set("enabled", event.target.checked)}
                    />
                    <span>Business is registered for GST</span>
                </label>

                {form.enabled && (
                    <div className={styles.grid}>
                        <label>
                            Legal business name
                            <input
                                required
                                value={form.legalName}
                                onChange={(event) => set("legalName", event.target.value)}
                            />
                        </label>

                        <label>
                            GSTIN
                            <input
                                required
                                maxLength={15}
                                value={form.gstin}
                                onChange={(event) =>
                                    set(
                                        "gstin",
                                        event.target.value
                                            .toUpperCase()
                                            .replace(/[^A-Z0-9]/g, ""),
                                    )
                                }
                                placeholder="29ABCDE1234F1Z5"
                            />
                        </label>

                        <label className={styles.full}>
                            Registered address
                            <textarea
                                required
                                rows={3}
                                value={form.registeredAddress}
                                onChange={(event) =>
                                    set("registeredAddress", event.target.value)
                                }
                            />
                        </label>

                        <label>
                            Registered state
                            <select
                                required
                                value={form.stateCode}
                                onChange={(event) => selectState(event.target.value)}
                            >
                                <option value="">Select state</option>
                                {GST_STATES.map((state) => (
                                    <option key={state.code} value={state.code}>
                                        {state.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            State code
                            <input value={form.stateCode} readOnly />
                        </label>

                        <label>
                            Invoice prefix
                            <input
                                required
                                maxLength={8}
                                value={form.invoicePrefix}
                                onChange={(event) =>
                                    set(
                                        "invoicePrefix",
                                        event.target.value
                                            .toUpperCase()
                                            .replace(/[^A-Z0-9-]/g, ""),
                                    )
                                }
                            />
                        </label>

                        <label>
                            Default GST rate (%)
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.defaultTaxRate}
                                onChange={(event) =>
                                    set("defaultTaxRate", Number(event.target.value))
                                }
                            />
                            <small>
                                Fallback only. A product's own rate is always preferred.
                            </small>
                        </label>

                        <label>
                            Shipping GST rate (%)
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.shippingTaxRate}
                                onChange={(event) =>
                                    set("shippingTaxRate", Number(event.target.value))
                                }
                            />
                        </label>

                        <label>
                            Product prices
                            <select
                                value={form.priceIncludesTax ? "inclusive" : "exclusive"}
                                onChange={(event) =>
                                    set("priceIncludesTax", event.target.value === "inclusive")
                                }
                            >
                                <option value="inclusive">Include GST</option>
                                <option value="exclusive">Exclude GST</option>
                            </select>
                            <small>
                                {form.priceIncludesTax
                                    ? "The customer pays the listed price; GST is split out of it."
                                    : "GST is added on top, so the customer pays more than the listed price."}
                            </small>
                        </label>

                        <label className={styles.toggle}>
                            <input
                                type="checkbox"
                                checked={form.reverseCharge}
                                onChange={(event) =>
                                    set("reverseCharge", event.target.checked)
                                }
                            />
                            <span>Reverse charge applies by default</span>
                        </label>
                    </div>
                )}

                <div className={styles.actions}>
                    <button type="submit" disabled={saving}>
                        {saving ? "Saving..." : "Save GST settings"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TaxSettingsPage;
