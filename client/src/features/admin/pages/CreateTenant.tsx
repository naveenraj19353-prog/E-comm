import { useState } from "react";
import { type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/CreateTenant.module.css";
import { useCreateTenant } from "../hooks/useTenants";
export default function CreateTenant() {
    const navigate = useNavigate();
    const createTenantMutation = useCreateTenant();
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [logo, setLogo] = useState("");
    const [theme, setTheme] = useState("green");
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
            const response = await createTenantMutation.mutateAsync({
                name: name.trim(),
                slug: slug.trim(),
                logo: logo.trim(),
                theme,
            });
            const createdTenant = response.data;
            navigate(`/admin/tenants/${createdTenant.tenantId}`);
        }
        catch (error: unknown) {
            console.error("Create tenant failed:", error);
            setError("Failed to create tenant.");
        }
    };
    return (<div className={styles.page}>
      
      <div className={styles.header}>
        <div>
          <button type="button" className={styles.backButton} onClick={() => navigate("/admin/tenants")}>
            ← Back to Tenants
          </button>
          <span className={styles.eyebrow}>PLATFORM</span>
          <h1>Create Tenant</h1>
          <p>Create a new store on the OmniStore platform.</p>
        </div>
      </div>
      
      <form className={styles.formCard} onSubmit={handleSubmit}>
        <div className={styles.formHeader}>
          <div>
            <h2>Tenant Information</h2>
            <p>Enter the basic information for the new tenant.</p>
          </div>
          <div className={styles.newBadge}>New Tenant</div>
        </div>
        <div className={styles.formBody}>
          
          <div className={styles.field}>
            <label htmlFor="tenant-name">
              Tenant Name
              <span>*</span>
            </label>
            <input id="tenant-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Fashion Hub"/>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-slug">
              Store Slug
              <span>*</span>
            </label>
            <input id="tenant-slug" type="text" value={slug} onChange={(event) => setSlug(event.target.value
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, ""))} placeholder="fashion-hub"/>
            <small>Store URL: /{slug || "fashion-hub"}</small>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-logo">Logo URL</label>
            <input id="tenant-logo" type="text" value={logo} onChange={(event) => setLogo(event.target.value)} placeholder="https://example.com/logo.png"/>
            <small>Optional. You can add a logo later.</small>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-theme">Theme</label>
            <select id="tenant-theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          
          <div className={styles.preview}>
            <div className={styles.previewHeader}>Preview</div>
            <div className={styles.previewBody}>
              <div className={styles.previewLogo}>
                {logo ? (<img src={logo} alt="Logo preview"/>) : name ? (name.charAt(0).toUpperCase()) : ("O")}
              </div>
              <div>
                <strong>{name || "Tenant Name"}</strong>
                <span>/{slug || "tenant-slug"}</span>
              </div>
            </div>
          </div>
          
          {error && <div className={styles.error}>{error}</div>}
        </div>
        
        <div className={styles.formFooter}>
          <button type="button" className={styles.cancelButton} onClick={() => navigate("/admin/tenants")} disabled={createTenantMutation.isPending}>
            Cancel
          </button>
          <button type="submit" className={styles.saveButton} disabled={createTenantMutation.isPending}>
            {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
          </button>
        </div>
      </form>
    </div>);
}
