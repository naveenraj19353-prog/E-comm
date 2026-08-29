import { Link, useNavigate } from "react-router-dom";
import { useTenants } from "../hooks/useTenants";
import styles from "../styles/TenantsPage.module.css";
import { useAuth } from "../../auth/hooks/useAuth";
import { getVisibleTenants } from "../utils/visibleTenants";

export default function TenantsPage() {
    const navigate = useNavigate();
    const { data: tenants = [], isLoading, isError } = useTenants();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === "super_admin";
    const visibleTenants = getVisibleTenants(tenants, user);

    if (isLoading) {
        return <div className={styles.state}>Loading tenants...</div>;
    }

    if (isError) {
        return <div className={styles.state}>Failed to load tenants.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>PLATFORM</span>
                    <h2>Tenant Management</h2>
                    <p>Manage stores and tenant admin accounts.</p>
                </div>
                {isSuperAdmin && (
                    <button
                        type="button"
                        className={styles.createButton}
                        onClick={() => navigate("/admin/tenants/create")}
                    >
                        <span>+</span>
                        Create Tenant
                    </button>
                )}
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                    <div>
                        <h3>All Tenants</h3>
                        <span>Manage your stores and tenant accounts</span>
                    </div>
                </div>
                {visibleTenants.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No tenants yet.</p>
                        {isSuperAdmin && (
                            <button
                                type="button"
                                className={styles.createButton}
                                onClick={() => navigate("/admin/tenants/create")}
                            >
                                <span>+</span>
                                Create your first tenant
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Tenant</th>
                                    <th>Tenant ID</th>
                                    <th>Theme</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleTenants.map((tenant) => (
                                    <tr key={tenant._id}>
                                        <td>
                                            <div className={styles.tenant}>
                                                <div className={styles.logo}>
                                                    {tenant.logo ? (
                                                        <img src={tenant.logo} alt={tenant.name} />
                                                    ) : (
                                                        tenant.name.charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <Link to={`/admin/tenants/${tenant.tenantId}`}>
                                                    <div className={styles.tenantInfo}>
                                                        <strong>{tenant.name}</strong>
                                                        <span>/{tenant.slug}</span>
                                                    </div>
                                                </Link>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={styles.tenantId}>{tenant.tenantId}</span>
                                        </td>
                                        <td>
                                            <span className={styles.theme}>{tenant.theme}</span>
                                        </td>
                                        <td>
                                            <span
                                                className={
                                                    tenant.isActive ? styles.active : styles.inactive
                                                }
                                            >
                                                <span className={styles.statusDot} />
                                                {tenant.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={styles.date}>
                                                {tenant.createdAt
                                                    ? new Date(tenant.createdAt).toLocaleDateString()
                                                    : "-"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
