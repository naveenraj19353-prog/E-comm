import { useTenants } from "../hooks/useTenants";
import styles from "../styles/AdminDashboard.module.css";

export default function AdminDashboard() {
  const { data: tenants = [], isLoading, isError } = useTenants();
  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (isError) {
    return <div className={styles.error}>Failed to load tenants.</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ADMINISTRATION</span>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Manage your OmniStore platform and tenants.
          </p>
        </div>
        <button className={styles.createButton}>+ Create Tenant</button>
      </header>

      <section className={styles.stats}>
        <div className={styles.statCard}>
          <span>Total Tenants</span>
          <strong>{tenants.length}</strong>
        </div>

        <div className={styles.statCard}>
          <span>Active Tenants</span>
          <strong>{tenants.filter((tenant) => tenant.isActive).length}</strong>
        </div>

        <div className={styles.statCard}>
          <span>Platform</span>
          <strong>OmniStore</strong>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Tenants</h2>
            <p>Manage your registered stores.</p>
          </div>
        </div>

        <div className={styles.tenantList}>
          {tenants.map((tenant) => (
            <div key={tenant._id} className={styles.tenant}>
              <div className={styles.tenantLogo}>
                {tenant.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.tenantInfo}>
                <strong>{tenant.name}</strong>
                <span>/{tenant.tenantId}</span>
              </div>
              <div className={styles.tenantId}> {tenant.slug}</div>
              <span
                className={tenant.isActive ? styles.active : styles.inactive}
              >
                <i />
                {tenant.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
