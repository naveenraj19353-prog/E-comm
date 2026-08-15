import { useNavigate, useParams } from "react-router-dom";

import { useTenantByTenantId } from "../hooks/useTenants";

import styles from "../styles/AdminTenant.module.css";

export default function AdminTenant() {
  const { tenantId } = useParams();
  const navigate = useNavigate();

  const {
    data: tenant,
    isLoading,
    isError,
  } = useTenantByTenantId(tenantId || "");

  if (isLoading) {
    return (
      <div className={styles.state}>
        <div className={styles.spinner} />
        <p>Loading tenant...</p>
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className={styles.state}>
        <h2>Tenant not found</h2>

        <p>
          Unable to find tenant <strong>{tenantId}</strong>.
        </p>

        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate("/admin/tenants")}
        >
          ← Back to Tenants
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate("/admin/tenants")}
          >
            ← Back to Tenants
          </button>

          <div className={styles.eyebrow}>{tenant.tenantId}</div>

          <h1>{tenant.name}</h1>

          <p>/{tenant.slug}</p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.editButton}
            onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/edit`)}
          >
            Edit Tenant
          </button>

          <button
            type="button"
            className={styles.productsButton}
            onClick={() =>
              navigate(`/admin/tenants/${tenant.tenantId}/products`)
            }
          >
            Manage Products
          </button>
        </div>
      </div>

      {/* =====================================================
          STATUS
      ===================================================== */}

      <div className={styles.statusCard}>
        <div className={styles.statusInfo}>
          <span className={styles.statusLabel}>Status</span>

          <span className={tenant.isActive ? styles.active : styles.inactive}>
            <span className={styles.statusDot} />

            {tenant.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* =====================================================
          TENANT INFORMATION
      ===================================================== */}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>TENANT</span>

            <h2>Tenant Information</h2>

            <p>Details and configuration for this store.</p>
          </div>
        </div>

        <div className={styles.infoGrid}>
          {/* TENANT ID */}

          <div className={styles.infoCard}>
            <span>Tenant ID</span>

            <strong>{tenant.tenantId}</strong>
          </div>

          {/* STORE NAME */}

          <div className={styles.infoCard}>
            <span>Store Name</span>

            <strong>{tenant.name}</strong>
          </div>

          {/* SLUG */}

          <div className={styles.infoCard}>
            <span>Store Slug</span>

            <strong>/{tenant.slug}</strong>
          </div>

          {/* THEME */}

          <div className={styles.infoCard}>
            <span>Theme</span>

            <strong>{tenant.theme || "green"}</strong>
          </div>

          {/* CREATED */}

          <div className={styles.infoCard}>
            <span>Created</span>

            <strong>
              {tenant.createdAt
                ? new Date(tenant.createdAt).toLocaleDateString("en-IN")
                : "-"}
            </strong>
          </div>

          {/* UPDATED */}

          <div className={styles.infoCard}>
            <span>Last Updated</span>

            <strong>
              {tenant.updatedAt
                ? new Date(tenant.updatedAt).toLocaleDateString("en-IN")
                : "-"}
            </strong>
          </div>
        </div>
      </section>

      {/* =====================================================
          STORE PREVIEW
      ===================================================== */}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>STORE</span>

            <h2>Store Preview</h2>

            <p>Preview the tenant storefront.</p>
          </div>
        </div>

        <div className={styles.storeCard}>
          <div className={styles.storeLogo}>
            {tenant.logo ? (
              <img src={tenant.logo} alt={tenant.name} />
            ) : (
              tenant.name.charAt(0).toUpperCase()
            )}
          </div>

          <div className={styles.storeInfo}>
            <h3>{tenant.name}</h3>

            <p>/{tenant.slug}</p>

            <span>Theme: {tenant.theme || "green"}</span>
          </div>

          <button
            type="button"
            className={styles.viewStoreButton}
            onClick={() => navigate(`/${tenant.slug}`)}
          >
            View Store →
          </button>
        </div>
      </section>

      {/* =====================================================
          ACTIONS
      ===================================================== */}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>MANAGEMENT</span>

            <h2>Actions</h2>

            <p>Manage this tenant.</p>
          </div>
        </div>

        <div className={styles.actionsGrid}>
          {/* EDIT */}

          <button
            type="button"
            className={styles.actionCard}
            onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/edit`)}
          >
            <div className={styles.actionIcon}>✎</div>

            <div>
              <strong>Edit Tenant</strong>

              <span>Update store information, theme and status.</span>
            </div>

            <b>→</b>
          </button>

          {/* PRODUCTS */}

          <button
            type="button"
            className={styles.actionCard}
            onClick={() =>
              navigate(`/admin/tenants/${tenant.tenantId}/products`)
            }
          >
            <div className={styles.actionIcon}>◫</div>

            <div>
              <strong>Manage Products</strong>

              <span>View and manage products for this tenant.</span>
            </div>

            <b>→</b>
          </button>
        </div>
      </section>
    </div>
  );
}
