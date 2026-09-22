import type { Tenant } from "../../types/tenant";
import styles from "./StoreOpeningPlaceholder.module.css";

type StoreOpeningPlaceholderProps = {
  storeName: string;
  tenant?: Tenant | null;
};

export default function StoreOpeningPlaceholder({
  storeName,
  tenant,
}: StoreOpeningPlaceholderProps) {
  const logo = (tenant?.logo || "").trim();
  const description =
    tenant?.footerContent?.description?.trim() ||
    `${storeName} is getting ready. Products will appear here as soon as the catalog is live.`;

  return (
    <section className={styles.hero} aria-label={`${storeName} coming soon`}>
      <div className={styles.card}>
        {logo ? (
          <img className={styles.logo} src={logo} alt="" />
        ) : (
          <span className={styles.mark} aria-hidden="true">
            {storeName.trim().charAt(0).toUpperCase() || "S"}
          </span>
        )}
        <p className={styles.eyebrow}>Opening soon</p>
        <h1 className={styles.title}>{storeName}</h1>
        <p className={styles.lead}>{description}</p>
        <p className={styles.hint}>
          This storefront is live. Check back shortly for products, deals, and
          more.
        </p>
      </div>
    </section>
  );
}
