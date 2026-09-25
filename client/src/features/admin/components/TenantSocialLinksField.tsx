import { SOCIAL_PLATFORMS, socialLinkError, type SocialLinks } from "../../tenant/storeProfile";
import styles from "../styles/EditTenant.module.css";

type Props = {
    value: SocialLinks;
    onChange: (next: SocialLinks) => void;
    disabled?: boolean;
};

/** Footer social media links (INT-013). Only filled-in links are shown to shoppers. */
export default function TenantSocialLinksField({ value, onChange, disabled = false }: Props) {
    return (
        <div className={styles.scheduleBlock}>
            <div className={styles.statusSection}>
                <div>
                    <h3>Social media links</h3>
                    <p>Icons appear in your storefront footer only for the links you add. Links open in a new tab.</p>
                </div>
            </div>
            {SOCIAL_PLATFORMS.map(({ key, label, hosts }) => {
                const error = socialLinkError(key, value[key] || "");
                return (
                    <div key={key} className={styles.field}>
                        <label htmlFor={`social-${key}`}>{label}</label>
                        <input
                            id={`social-${key}`}
                            type="url"
                            inputMode="url"
                            value={value[key] || ""}
                            maxLength={300}
                            placeholder={`https://${hosts[0]}/yourstore`}
                            disabled={disabled}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                        />
                        {error ? <small className={styles.logoError}>{error}</small> : null}
                    </div>
                );
            })}
        </div>
    );
}
