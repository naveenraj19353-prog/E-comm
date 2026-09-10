import styles from "./Welcome.module.css";
import { formatStorefrontHost, getStorefrontHref } from "../../features/tenant/tenantHost";

const demoStores = [
    { slug: "shopsphere", label: "ShopSphere", description: "Fashion & lifestyle" },
];

export default function Welcome() {
    return (
        <div className={styles.page}>
            <main className={styles.card}>
                <p className={styles.eyebrow}>Multi-tenant e-commerce</p>
                <h1 className={styles.title}>Welcome to Retail Cosmos</h1>
                <p className={styles.lead}>
                    Pick a storefront below or sign in to the admin panel to manage
                    tenants, products, and themes.
                </p>

                <section className={styles.stores} aria-label="Demo stores">
                    <h2 className={styles.sectionTitle}>Browse stores</h2>
                    <ul className={styles.storeList}>
                        {demoStores.map((store) => (
                            <li key={store.slug}>
                                <a
                                    href={getStorefrontHref(store.slug)}
                                    className={styles.storeLink}
                                >
                                    <span className={styles.storeName}>
                                        {store.label}
                                    </span>
                                    <span className={styles.storeDesc}>
                                        {store.description}
                                    </span>
                                    <span className={styles.storeDesc}>
                                        {formatStorefrontHost(store.slug)}
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>

                <div className={styles.actions}>
                    <a href="/admin/login" className={styles.adminLink}>
                        Admin login
                    </a>
                </div>
            </main>
        </div>
    );
}
