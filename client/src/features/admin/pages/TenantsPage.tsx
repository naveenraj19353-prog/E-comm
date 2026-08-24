import { useState } from "react";
import type { SubmitEvent } from "react";
import { useCreateTenant, useTenants } from "../hooks/useTenants";
import styles from "../styles/TenantsPage.module.css";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
export default function TenantsPage() {
  const { data: tenants = [], isLoading, isError } = useTenants();
const { user } = useAuth();
const isAdmin = user?.role === "admin";
  const visibleTenants = isAdmin
    ? tenants.filter(
        (tenant) =>
          tenant.name?.trim().toLowerCase() ===
          user?.name?.trim().toLowerCase(),
      )
    : tenants;
  const createTenantMutation = useCreateTenant();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logo, setLogo] = useState("");
  const [theme, setTheme] = useState("green");
  const resetForm = () => {
    setName("");
    setSlug("");
    setLogo("");
    setTheme("green");
  };
  const closeModal = () => {
    if (createTenantMutation.isPending) {
      return;
    }
    setShowModal(false);
    resetForm();
  };
  const handleNameChange = (value: string) => {
    setName(value);
    const generatedSlug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(generatedSlug);
  };
  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    if (!slug.trim()) {
      return;
    }
    try {
      await createTenantMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        logo: logo.trim(),
        theme,
      });
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create tenant:", error);
    }
  };
  if (isLoading) {
    return <div className={styles.state}>Loading tenants...</div>;
  }
  if (isError) {
    return <div className={styles.state}>Failed to load tenants.</div>;
  }
  return (
    <div className={styles.page}>
      {/* =========================================
          PAGE HEADER
      ========================================= */}
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PLATFORM</span>
          <h2>Tenant Management</h2>
          {/* <p>Create and manage all stores from one place.</p> */}
        </div>
        {/* <button
          type="button"
          className={styles.createButton}
          onClick={() => setShowModal(true)}
        >
          <span>+</span>
          Create Tenant
        </button> */}
      </div>
      {/* <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span>Total Tenants</span>
          <strong>{visibleTenants.length}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Active Tenants</span>
          <strong>{visibleTenants.filter((tenant) => tenant.isActive).length}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Inactive Tenants</span>
          <strong>{visibleTenants.filter((tenant) => !tenant.isActive).length}</strong>
        </div>
      </div> */}
      {/* =========================================
          TENANT TABLE
      ========================================= */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>All Tenants</h3>
            <span>Manage your stores and tenant accounts</span>
          </div>
        </div>
        {visibleTenants.length === 0 ? (
          <div className={styles.empty}>
            {/* <div className={styles.emptyIcon}>+</div>
            <h3>No tenants yet</h3>
            <p>Create your first tenant to get started.</p>
            <button
              type="button"
              className={styles.emptyButton}
              onClick={() => setShowModal(true)}
            >
              Create Tenant
            </button> */}
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
      {/* =========================================
          CREATE TENANT MODAL
      ========================================= */}
      {showModal && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalEyebrow}>NEW STORE</span>
                <h2>Create Tenant</h2>
                <p>Create a new store for your platform.</p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            <form className={styles.form} onSubmit={handleSubmit}>
              {/* NAME */}
              <div className={styles.field}>
                <label htmlFor="tenant-name">Store Name</label>
                <input
                  id="tenant-name"
                  type="text"
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="Example: Tech World"
                  required
                />
              </div>
              {/* SLUG */}
              <div className={styles.field}>
                <label htmlFor="tenant-slug">Store Slug</label>
                <input
                  id="tenant-slug"
                  type="text"
                  value={slug}
                  onChange={(event) =>
                    setSlug(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  placeholder="tech-world"
                  required
                />
                <span className={styles.helpText}>
                  Store URL: /{slug || "your-store"}
                </span>
              </div>
              {/* LOGO */}
              <div className={styles.field}>
                <label htmlFor="tenant-logo">Logo URL</label>
                <input
                  id="tenant-logo"
                  type="text"
                  value={logo}
                  onChange={(event) => setLogo(event.target.value)}
                  placeholder="https://example.com/logo.png"
                />
                <span className={styles.helpText}>Optional</span>
              </div>
              {/* THEME */}
              <div className={styles.field}>
                <label htmlFor="tenant-theme">Theme</label>
                <select
                  id="tenant-theme"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="purple">Purple</option>
                  <option value="orange">Orange</option>
                  <option value="red">Red</option>
                </select>
              </div>
              {/* ERROR */}
              {createTenantMutation.isError && (
                <div className={styles.formError}>
                  Failed to create tenant. Please check the details and try
                  again.
                </div>
              )}
              {/* ACTIONS */}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeModal}
                  disabled={createTenantMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={createTenantMutation.isPending}
                >
                  {createTenantMutation.isPending
                    ? "Creating..."
                    : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
