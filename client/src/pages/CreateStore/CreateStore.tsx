import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { SeoHead } from "../../features/seo";
import { registerStoreApi } from "../../features/tenant/api/registerStore.api";
import { loginSuccess } from "../../features/auth/authSlice";
import {
  formatStorefrontHost,
} from "../../features/tenant/tenantHost";
import {
  getApiErrorMessage,
  normalizeTenantId,
  slugifyTenantValue,
} from "../../features/admin/utils/tenantForm.utils";
import styles from "./CreateStore.module.css";

export default function CreateStore() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugifyTenantValue(value));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const cleanSlug = normalizeTenantId(slug);
    if (!name.trim() || name.trim().length < 2) {
      setError("Store name is required.");
      return;
    }
    if (!cleanSlug || cleanSlug.length < 2) {
      setError("Choose a store URL of at least 2 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await registerStoreApi({
        name: name.trim(),
        slug: cleanSlug,
        email: email.trim().toLowerCase(),
        password,
      });
      if (!response.success || !response.access_token) {
        setError(response.message || "Could not create your store.");
        return;
      }
      dispatch(loginSuccess({ accessToken: response.access_token }));
      navigate(`/admin/tenants/${response.tenantId}`, { replace: true });
    } catch (submitError: unknown) {
      setError(
        getApiErrorMessage(submitError, "Could not create your store."),
      );
    } finally {
      setLoading(false);
    }
  };

  const previewHost = formatStorefrontHost(slug || "your-store");

  return (
    <div className={styles.page}>
      <SeoHead
        title="Create your store | Retail Cosmos"
        description="Launch your own multi-tenant storefront on Retail Cosmos in minutes — pick a URL, manage catalog and orders, and go live."
        path="/create-store"
        image="/images/welcome/demo-store.jpg"
      />
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          Retail Cosmos
        </Link>
        <Link to="/admin/login" className={styles.topLink}>
          Already have a store? Sign in
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Merchant signup</p>
          <h1 className={styles.title}>Create your store</h1>
          <p className={styles.lead}>
            Pick a name and URL. You&apos;ll manage products, orders, and theme
            from your admin panel — shoppers visit{" "}
            <span className={styles.mono}>{previewHost}</span>.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {error ? <p className={styles.error}>{error}</p> : null}

          <label className={styles.label}>
            Store name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="ShopSphere"
              autoComplete="organization"
              required
            />
          </label>

          <label className={styles.label}>
            Store URL
            <div className={styles.slugRow}>
              <span className={styles.slugPrefix}>/</span>
              <input
                className={styles.input}
                value={slug}
                onChange={(e) => setSlug(normalizeTenantId(e.target.value))}
                placeholder="shopsphere"
                autoComplete="off"
                required
              />
            </div>
            <span className={styles.hint}>
              Live at {previewHost}
              {slug ? (
                <>
                  {" "}
                  ·{" "}
                  <Link to={`/${slug}`} className={styles.hintLink}>
                    preview path
                  </Link>
                </>
              ) : null}
            </span>
          </label>

          <label className={styles.label}>
            Admin email
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          <label className={styles.label}>
            Confirm password
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "Creating store…" : "Create store"}
          </button>
        </form>
      </main>
    </div>
  );
}
