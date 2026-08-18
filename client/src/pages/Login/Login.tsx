import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import styles from "../../styles/Auth.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      const response = await login({
        tenantId: null,
        email: email.trim(),
        password,
      });

      if (response.success && response.access_token) {
        navigate("/admin/tenants");
        return;
      }

      setError("Invalid email or password.");
    } catch (error: any) {
      setError(error?.response?.data?.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>SA</div>

          <div>
            <strong>OmniStore</strong>
            <span>Administration</span>
          </div>
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>SUPER ADMIN</span>

          <h1>Welcome back</h1>

          <p>Sign in to manage your tenants and ecommerce platform.</p>
        </div>

        {error && (
          <div className={styles.error}>
            <span>!</span>
            {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="email">Email address</label>

            <input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password">Password</label>

              <button
                type="button"
                className={styles.forgotButton}
                onClick={() => {
                  // Add forgot-password flow later
                }}
              >
                Forgot password?
              </button>
            </div>

            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />

              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.loginButton}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.spinner} />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <span>→</span>
              </>
            )}
          </button>
        </form>

        <div className={styles.security}>
          <span className={styles.lock}>✓</span>

          <div>
            <strong>Secure access</strong>
            <span>Super Admin access only</span>
          </div>
        </div>

        <p className={styles.footer}>
          © {new Date().getFullYear()} OmniStore. All rights reserved.
        </p>
      </section>
    </main>
  );
}
