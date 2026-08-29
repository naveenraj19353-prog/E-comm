import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import styles from "../../styles/Auth.module.css";
import { useAuth } from "../../features/auth/hooks/useAuth";

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const redirectPath = (location.state as { from?: string; message?: string } | null)?.from;
    const redirectMessage = (location.state as { from?: string; message?: string } | null)?.message;
    const { login } = useAuth();
    const [tenantId, setTenantId] = useState("");
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
                tenantId: tenantId.trim() || null,
                email: email.trim(),
                password,
            });
            if (!response.success ||
                !response.access_token ||
                !response.user) {
                setError("Invalid email or password.");
                return;
            }
            const user = response.user;
            if (redirectPath && (user.role === "super_admin" || user.role === "admin")) {
                navigate(redirectPath, { replace: true });
                return;
            }
            if (user.role === "super_admin") {
                navigate("/admin", {
                    replace: true,
                });
                return;
            }
            if (user.role === "admin" &&
                user.tenantId) {
                navigate(`/admin/tenants/${user.tenantId}`, {
                    replace: true,
                });
                return;
            }
            setError("You do not have permission to access the admin portal.");
        }
        catch (error: any) {
            console.error("LOGIN ERROR:", error);
            setError(error?.response?.data?.detail ||
                "Invalid email or password.");
        }
        finally {
            setLoading(false);
        }
    };
    return (<main className={styles.authPage}>
      <section className={styles.authCard}>
        
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            SA
          </div>
          <div>
            <strong>OmniStore</strong>
            <span>Administration</span>
          </div>
        </div>
        
        <div className={styles.heading}>
          <span className={styles.eyebrow}>
            ADMIN PORTAL
          </span>
          <h1>Welcome back</h1>
          <p>
            Sign in to manage your ecommerce store.
          </p>
        </div>
        
        {redirectMessage && (<div className={styles.notice}>
            {redirectMessage}
          </div>)}

        {error && (<div className={styles.error}>
            <span>!</span>
            {error}
          </div>)}
        
        <form className={styles.form} onSubmit={handleSubmit}>
          
          <div className={styles.field}>
            <label htmlFor="tenantId">
              Tenant ID
            </label>
            <input id="tenantId" type="text" placeholder="Leave empty for Super Admin" value={tenantId} onChange={(event) => setTenantId(event.target.value)} autoComplete="organization" disabled={loading}/>
            <small>
              Tenant Admin: enter your tenant ID.
              Super Admin: leave this empty.
            </small>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="email">
              Email address
            </label>
            <input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={loading}/>
          </div>
          
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password">
                Password
              </label>
              <Link to="/admin/forgot-password" className={styles.forgotButton}>
                Forgot password?
              </Link>
            </div>
            <div className={styles.passwordWrapper}>
              <input id="password" type={showPassword
            ? "text"
            : "password"} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={loading}/>
              <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((current) => !current)}>
                {showPassword
            ? "Hide"
            : "Show"}
              </button>
            </div>
          </div>
          
          <button type="submit" className={styles.loginButton} disabled={loading}>
            {loading ? (<>
                <span className={styles.spinner}/>
                Signing in...
              </>) : (<>
                Sign in
                <span>→</span>
              </>)}
          </button>
        </form>
        
        <div className={styles.security}>
          <span className={styles.lock}>
            ✓
          </span>
          <div>
            <strong>
              Secure access
            </strong>
            <span>
              Super Admin and Tenant Admin
            </span>
          </div>
        </div>
        <p className={styles.footer}>
          © {new Date().getFullYear()} OmniStore.
          All rights reserved.
        </p>
      </section>
    </main>);
}
