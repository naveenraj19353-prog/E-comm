import { useState } from "react";
import { type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/CreateTenant.module.css";
import { useCreateTenant } from "../hooks/useTenants";
import {
    getApiErrorMessage,
    normalizeTenantId,
    slugifyTenantValue,
    validateCreateTenantForm,
} from "../utils/tenantForm.utils";

export default function CreateTenant() {
    const navigate = useNavigate();
    const createTenantMutation = useCreateTenant();
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [tenantId, setTenantId] = useState("");
    const [tenantIdEdited, setTenantIdEdited] = useState(false);
    const [logo, setLogo] = useState("");
    const [theme, setTheme] = useState("green");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");

    const handleNameChange = (value: string) => {
        setName(value);
        const nextSlug = slugifyTenantValue(value);
        setSlug(nextSlug);
        if (!tenantIdEdited) {
            setTenantId(nextSlug);
        }
    };

    const handleSlugChange = (value: string) => {
        const nextSlug = normalizeTenantId(value);
        setSlug(nextSlug);
        if (!tenantIdEdited) {
            setTenantId(nextSlug);
        }
    };

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");

        const validationError = validateCreateTenantForm({
            name,
            slug,
            tenantId,
            logo,
            theme,
            email,
            password,
            confirmPassword,
        });
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            const response = await createTenantMutation.mutateAsync({
                tenantId: tenantId.trim().toLowerCase(),
                name: name.trim(),
                slug: slug.trim().toLowerCase(),
                logo: logo.trim(),
                theme,
                email: email.trim().toLowerCase(),
                password,
            });
            const createdTenant = response.data;
            navigate(`/admin/tenants/${createdTenant.tenantId}`);
        } catch (submitError: unknown) {
            console.error("Create tenant failed:", submitError);
            setError(getApiErrorMessage(submitError, "Failed to create tenant."));
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => navigate("/admin/tenants")}
                    >
                        ← Back to Tenants
                    </button>
                    <span className={styles.eyebrow}>PLATFORM</span>
                    <h1>Create Tenant</h1>
                    <p>Create a new store and its admin login on the OmniStore platform.</p>
                </div>
            </div>

            <form className={styles.formCard} onSubmit={handleSubmit}>
                <div className={styles.formHeader}>
                    <div>
                        <h2>Store details</h2>
                        <p>Basic storefront information for the new business.</p>
                    </div>
                    <div className={styles.newBadge}>New Tenant</div>
                </div>

                <div className={styles.formBody}>
                    <div className={styles.field}>
                        <label htmlFor="tenant-name">
                            Store Name
                            <span>*</span>
                        </label>
                        <input
                            id="tenant-name"
                            type="text"
                            value={name}
                            onChange={(event) => handleNameChange(event.target.value)}
                            placeholder="Example: Fashion Hub"
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="tenant-slug">
                            Store Slug
                            <span>*</span>
                        </label>
                        <input
                            id="tenant-slug"
                            type="text"
                            value={slug}
                            onChange={(event) => handleSlugChange(event.target.value)}
                            placeholder="fashion-hub"
                        />
                        <small>Storefront URL: /{slug || "fashion-hub"}</small>
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="tenant-id">
                            Tenant ID
                            <span>*</span>
                        </label>
                        <input
                            id="tenant-id"
                            type="text"
                            value={tenantId}
                            onChange={(event) => {
                                setTenantIdEdited(true);
                                setTenantId(normalizeTenantId(event.target.value));
                            }}
                            placeholder="fashion-hub"
                        />
                        <small>Used for admin login. Auto-filled from slug; you can customize it.</small>
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="tenant-logo">Logo URL</label>
                        <input
                            id="tenant-logo"
                            type="text"
                            value={logo}
                            onChange={(event) => setLogo(event.target.value)}
                            placeholder="https://example.com/logo.png"
                        />
                        <small>Optional. You can add a logo later.</small>
                    </div>

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

                    <div className={`${styles.sectionTitle} ${styles.fullWidth}`}>
                        Admin account
                    </div>
                    <p className={`${styles.sectionHint} ${styles.fullWidth}`}>
                        These credentials let the business owner sign in at the admin login page.
                    </p>

                    <div className={styles.field}>
                        <label htmlFor="admin-email">
                            Admin Email
                            <span>*</span>
                        </label>
                        <input
                            id="admin-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="owner@business.com"
                            autoComplete="email"
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="admin-password">
                            Admin Password
                            <span>*</span>
                        </label>
                        <input
                            id="admin-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Minimum 6 characters"
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="admin-confirm-password">
                            Confirm Password
                            <span>*</span>
                        </label>
                        <input
                            id="admin-confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Re-enter password"
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={styles.preview}>
                        <div className={styles.previewHeader}>Preview</div>
                        <div className={styles.previewBody}>
                            <div className={styles.previewLogo}>
                                {logo ? (
                                    <img src={logo} alt="Logo preview" />
                                ) : name ? (
                                    name.charAt(0).toUpperCase()
                                ) : (
                                    "O"
                                )}
                            </div>
                            <div>
                                <strong>{name || "Store Name"}</strong>
                                <span>/{slug || "store-slug"}</span>
                                <span>Admin: {email || "owner@business.com"}</span>
                            </div>
                        </div>
                    </div>

                    {error && <div className={styles.error}>{error}</div>}
                </div>

                <div className={styles.formFooter}>
                    <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => navigate("/admin/tenants")}
                        disabled={createTenantMutation.isPending}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={styles.saveButton}
                        disabled={createTenantMutation.isPending}
                    >
                        {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                    </button>
                </div>
            </form>
        </div>
    );
}
