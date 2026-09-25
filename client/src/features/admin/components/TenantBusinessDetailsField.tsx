import { BUSINESS_DETAIL_FIELDS, gstinError, type BusinessDetails } from "../../tenant/storeProfile";
import styles from "../styles/EditTenant.module.css";

type Props = {
    value: BusinessDetails;
    onChange: (next: BusinessDetails) => void;
    disabled?: boolean;
};

/** Registered name, address and GSTIN shown on the storefront (REQ-011). */
export default function TenantBusinessDetailsField({ value, onChange, disabled = false }: Props) {
    const error = gstinError(value.gstin || "");
    return (
        <div className={styles.scheduleBlock}>
            <div className={styles.statusSection}>
                <div>
                    <h3>Business details</h3>
                    <p>Shown on your storefront's Contact page and footer. Leave a field empty to hide it.</p>
                </div>
            </div>
            {BUSINESS_DETAIL_FIELDS.map((field) => (
                <div key={field.key} className={styles.field}>
                    <label htmlFor={`business-${field.key}`}>{field.label}</label>
                    <input
                        id={`business-${field.key}`}
                        type="text"
                        value={value[field.key] || ""}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        autoComplete="off"
                        onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                    />
                    {field.key === "gstin" && error ? <small className={styles.logoError}>{error}</small> : null}
                </div>
            ))}
        </div>
    );
}
