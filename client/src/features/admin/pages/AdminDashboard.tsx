import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useTenants } from "../hooks/useTenants";
import styles from "../styles/AdminDashboard.module.css";
export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const { data: tenants = [], isLoading, isError } = useTenants();
  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }
  if (isError) {
    return <div className={styles.error}>Failed to load tenants.</div>;
  }
  console.log(user?.name?.trim().toLowerCase(), tenants);
  const visibleTenants = isAdmin
    ? tenants.filter(
        (tenant) =>
          tenant.name?.trim().toLowerCase() ===
          user?.name?.trim().toLowerCase(),
      )
    : tenants;
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
        {!isAdmin ? (
          <button className={styles.createButton}>+ Create Tenant</button>
        ) : (
          ""
        )}
      </header>
      {!isAdmin ? (
        <section className={styles.stats}>
          <div className={styles.statCard}>
            <span>Total Tenants</span>
            <strong>{visibleTenants.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Active Tenants</span>
            <strong>
              {visibleTenants.filter((tenant) => tenant.isActive).length}
            </strong>
          </div>
          <div className={styles.statCard}>
            <span>Platform</span>
            <strong>OmniStore</strong>
          </div>
        </section>
      ) : (
        ""
      )}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Tenants</h2>
            <p>Manage your registered stores.</p>
          </div>
        </div>
        <div className={styles.tenantList}>
          {visibleTenants.map((tenant) => (
            <div
              key={tenant._id}
              className={styles.tenant}
              onClick={() => {
                navigate(`/${tenant.tenantId}`);
              }}
            >
              <div className={styles.tenantLogo}>{tenant.name.charAt(0)}</div>
              <div className={styles.tenantInfo}>
                <strong>{tenant.name}</strong>
                <span>/{tenant.tenantId}</span>
              </div>
              <div className={styles.tenantId}>{tenant.slug}</div>
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
