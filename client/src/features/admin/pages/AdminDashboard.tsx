import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useTenants } from "../hooks/useTenants";
import styles from "../styles/AdminDashboard.module.css";
import { getVisibleTenants } from "../utils/visibleTenants";

export default function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isSuperAdmin = user?.role === "super_admin";
    const { data: tenants = [], isLoading, isError } = useTenants();
    const visibleTenants = getVisibleTenants(tenants, user);

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
                {isSuperAdmin && (
                    <button
                        type="button"
                        className={styles.createButton}
                        onClick={() => navigate("/admin/tenants/create")}
                    >
                        + Create Tenant
                    </button>
                )}
            </header>

            {isSuperAdmin && (
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
            )}

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h2>Tenants</h2>
                        <p>Manage your registered stores.</p>
                    </div>
                    {isSuperAdmin && (
                        <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => navigate("/admin/tenants")}
                        >
                            View all
                        </button>
                    )}
                </div>
                <div className={styles.tenantList}>
                    {visibleTenants.map((tenant) => (
                        <div
                            key={tenant._id}
                            className={styles.tenant}
                            onClick={() => navigate(`/admin/tenants/${tenant.tenantId}`)}
                        >
                            <div className={styles.tenantLogo}>
                                {tenant.logo ? (
                                    <img src={tenant.logo} alt={tenant.name} />
                                ) : (
                                    tenant?.name?.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className={styles.tenantInfo}>
                                <strong>{tenant.name}</strong>
                                <span>/{tenant.slug}</span>
                            </div>
                            <div className={styles.tenantId}>{tenant.tenantId}</div>
                            <span className={tenant.isActive ? styles.active : styles.inactive}>
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
