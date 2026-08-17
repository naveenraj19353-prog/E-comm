import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useTenantByTenantId, useUpdateTenant } from "../hooks/useTenants";

import styles from "../styles/EditTenant.module.css";

import type { SubmitEvent } from "react";

export default function EditTenant() {
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

        <p>Unable to load tenant information.</p>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => navigate("/admin/tenants")}
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  return <EditTenantForm key={tenant._id} tenant={tenant} />;
}

interface EditTenantFormProps {
  tenant: NonNullable<ReturnType<typeof useTenantByTenantId>["data"]>;
}

function EditTenantForm({ tenant }: EditTenantFormProps) {
  const navigate = useNavigate();

  const updateTenantMutation = useUpdateTenant();

  const [name, setName] = useState(tenant.name || "");
  const [slug, setSlug] = useState(tenant.slug || "");
  const [logo, setLogo] = useState(tenant.logo || "");
  const [theme, setTheme] = useState(tenant.theme || "green");
  const [isActive, setIsActive] = useState(tenant.isActive ?? true);

  const [error, setError] = useState("");

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Tenant name is required.");
      return;
    }

    if (!slug.trim()) {
      setError("Tenant slug is required.");
      return;
    }

    try {
      await updateTenantMutation.mutateAsync({
        id: tenant._id,
        payload: {
          name: name.trim(),
          slug: slug.trim(),
          logo: logo.trim(),
          theme,
          isActive,
        },
      });

      navigate(`/admin/tenants/${tenant.tenantId}`);
    } catch (error: unknown) {
      console.error("Failed to update tenant:", error);

      setError("Failed to update tenant.");
    }
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}

      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(`/admin/tenants/${tenant.tenantId}`)}
          >
            ← Back to Tenant
          </button>

          <span className={styles.eyebrow}>{tenant.tenantId}</span>

          <h1>Edit Tenant</h1>

          <p>
            Update the configuration for <strong>{tenant.name}</strong>
          </p>
        </div>
      </div>

      {/* FORM */}

      <form className={styles.formCard} onSubmit={handleSubmit}>
        <div className={styles.formHeader}>
          <div>
            <h2>Tenant Information</h2>

            <p>Update the basic information and appearance of this tenant.</p>
          </div>

          <div
            className={`${styles.statusBadge} ${
              isActive ? styles.active : styles.inactive
            }`}
          >
            <span />
            {isActive ? "Active" : "Inactive"}
          </div>
        </div>

        <div className={styles.formBody}>
          {/* TENANT ID */}

          <div className={styles.field}>
            <label>Tenant ID</label>

            <input type="text" value={tenant.tenantId} disabled />

            <small>Tenant ID cannot be changed.</small>
          </div>

          {/* NAME */}

          <div className={styles.field}>
            <label htmlFor="tenant-name">
              Tenant Name
              <span>*</span>
            </label>

            <input
              id="tenant-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter tenant name"
            />
          </div>

          {/* SLUG */}

          <div className={styles.field}>
            <label htmlFor="tenant-slug">
              Slug
              <span>*</span>
            </label>

            <input
              id="tenant-slug"
              type="text"
              value={slug}
              onChange={(event) =>
                setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              placeholder="tenant-slug"
            />

            <small>Store URL: /{slug || "tenant-slug"}</small>
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

            {logo && (
              <div className={styles.logoPreview}>
                <img
                  src={logo}
                  alt="Tenant logo preview"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
            )}
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

              <option value="dark">Dark</option>
            </select>
          </div>

          {/* STATUS */}

          <div className={styles.statusSection}>
            <div>
              <h3>Tenant Status</h3>

              <p>Inactive tenants cannot be accessed from the storefront.</p>
            </div>

            <button
              type="button"
              className={`${styles.toggle} ${
                isActive ? styles.toggleActive : ""
              }`}
              onClick={() => setIsActive((value) => !value)}
              aria-label={isActive ? "Deactivate tenant" : "Activate tenant"}
            >
              <span />
            </button>
          </div>

          {/* ERROR */}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* FOOTER */}

        <div className={styles.formFooter}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate(`/admin/tenants/${tenant.tenantId}`)}
            disabled={updateTenantMutation.isPending}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.saveButton}
            disabled={updateTenantMutation.isPending}
          >
            {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
