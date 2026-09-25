import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, type StoreSeo } from "../../tenant/storeProfile";
import styles from "../styles/EditTenant.module.css";

type Props = {
    value: StoreSeo;
    storeName: string;
    onChange: (next: StoreSeo) => void;
    disabled?: boolean;
};

/** Search-engine title and description for the store home page (REQ-106, REQ-107). */
export default function TenantSeoField({ value, storeName, onChange, disabled = false }: Props) {
    const title = value.title || "";
    const description = value.description || "";
    return (
        <div className={styles.scheduleBlock}>
            <div className={styles.statusSection}>
                <div>
                    <h3>Search engine listing (SEO)</h3>
                    <p>
                        The title and description Google and other search engines show for your store's home page.
                        Leave empty to use your store name and footer description.
                    </p>
                </div>
            </div>
            <div className={styles.field}>
                <label htmlFor="seo-title">SEO title</label>
                <input
                    id="seo-title"
                    type="text"
                    value={title}
                    maxLength={SEO_TITLE_MAX}
                    placeholder={storeName || "Store name"}
                    disabled={disabled}
                    onChange={(event) => onChange({ ...value, title: event.target.value })}
                />
                <small>{title.length}/{SEO_TITLE_MAX} characters</small>
            </div>
            <div className={styles.field}>
                <label htmlFor="seo-description">SEO description</label>
                <textarea
                    id="seo-description"
                    value={description}
                    maxLength={SEO_DESCRIPTION_MAX}
                    rows={3}
                    placeholder="One or two sentences about what you sell."
                    disabled={disabled}
                    onChange={(event) => onChange({ ...value, description: event.target.value })}
                />
                <small>{description.length}/{SEO_DESCRIPTION_MAX} characters</small>
            </div>
        </div>
    );
}
