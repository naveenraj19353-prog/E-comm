import { DISPLAY_CURRENCIES, resolveDisplayCurrency } from "../../../utils/currency";
import styles from "../styles/EditTenant.module.css";

type TenantCurrencyFieldProps = {
    currency: string;
    inrPerUnit: string;
    onCurrencyChange: (code: string) => void;
    onRateChange: (value: string) => void;
};

export default function TenantCurrencyField({
    currency,
    inrPerUnit,
    onCurrencyChange,
    onRateChange,
}: TenantCurrencyFieldProps) {
    const selected = resolveDisplayCurrency(currency);
    const isInr = selected.code === "INR";
    return (
        <div className={styles.field}>
            <label htmlFor="tenant-currency">Storefront currency</label>
            <select
                id="tenant-currency"
                value={selected.code}
                onChange={(event) => {
                    const next = event.target.value;
                    onCurrencyChange(next);
                    const defaults = DISPLAY_CURRENCIES.find((item) => item.code === next);
                    if (defaults) {
                        onRateChange(String(defaults.inrPerUnit));
                    }
                }}
            >
                {DISPLAY_CURRENCIES.map((item) => (
                    <option key={item.code} value={item.code}>
                        {item.name}
                    </option>
                ))}
            </select>
            <small>
                Products, carts, and checkout stay stored in INR. Shoppers see this currency.
            </small>
            {isInr ? null : (
                <>
                    <label htmlFor="tenant-inr-rate" style={{ marginTop: "0.75rem" }}>
                        INR per 1 {selected.code}
                    </label>
                    <input
                        id="tenant-inr-rate"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={inrPerUnit}
                        onChange={(event) => onRateChange(event.target.value)}
                    />
                    <small>
                        Built-in default is {selected.inrPerUnit}. Change it if you want a
                        fixed store rate.
                    </small>
                </>
            )}
        </div>
    );
}
