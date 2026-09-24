import { usePageSeo } from "../seo";
import styles from "./StoreUnavailable.module.css";

interface StoreUnavailableProps {
    name?: string;
    logo?: string;
}

/** Shown to shoppers in place of the storefront when the store is offline. */
const StoreUnavailable = ({ name, logo }: StoreUnavailableProps) => {
    const storeName = (name || "").trim();
    const logoSrc = (logo || "").trim();

    usePageSeo({
        title: storeName || "Store unavailable",
        description: "This store is temporarily unavailable.",
        noIndex: true,
    });

    return (
        <div className={styles.page}>
            <div className={styles.content}>
                {logoSrc ? (
                    <img className={styles.logo} src={logoSrc} alt={storeName || "Store logo"} />
                ) : null}
                {storeName ? <h1>{storeName}</h1> : null}
                <p>This store is temporarily unavailable. Please check back soon.</p>
            </div>
        </div>
    );
};

export default StoreUnavailable;
